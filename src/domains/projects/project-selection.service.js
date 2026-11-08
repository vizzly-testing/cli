import { dirname, resolve } from 'node:path';
import { getRepositoryInfo } from '../../shared/git.js';
import * as output from '../../shared/output.js';
import { createPrompts } from '../../shared/terminal-prompts.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { requireCredentialScope } from '../auth/credential.rules.js';
import { discoverProjects } from './discovery.service.js';
import { normalizeRepositoryRemote } from './project-selection.normalizers.js';
import {
  readProjectSelection,
  saveProjectSelection,
} from './project-selection-store.js';

export function isProjectSelectionInteractive() {
  return Boolean(
    process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.env.CI &&
      !output.isJson()
  );
}

function selectedProject(project, source, repositories = []) {
  return {
    project,
    projectQuery: {
      project: project.projectSlug,
      organization: project.organizationSlug,
    },
    source,
    repository: repositories.length === 1 ? repositories[0] : null,
    repositories,
  };
}

async function repositoryProjects(client, repository) {
  let projects = [];
  let offset = 0;
  while (true) {
    let page = await discoverProjects(client, {
      repository,
      limit: 250,
      offset,
    });
    projects.push(...page.projects);
    if (!page.pagination.hasMore) return projects;
    if (page.pagination.nextOffset === null) {
      throw new VizzlyError(
        'Project discovery exceeded the paging limit. Choose a project explicitly.',
        'PROJECT_DISCOVERY_INCOMPLETE'
      );
    }
    offset = page.pagination.nextOffset;
  }
}

async function pickProject(candidates) {
  output.stopSpinner();
  output.labelValue('Projects connected to this checkout', candidates.length);
  candidates.forEach((candidate, index) => {
    output.print(
      `  ${index + 1}. ${candidate.organizationSlug}/${candidate.slug} (${candidate.name || candidate.slug})`
    );
  });
  let prompts = createPrompts();
  try {
    while (true) {
      let answer = await prompts.ask('Choose project number (q to cancel)');
      if (answer === 'q') return null;
      let project = /^\d+$/.test(answer)
        ? candidates[Number(answer) - 1]
        : null;
      if (project) return project;
      output.hint('Enter a project number, or q to cancel.');
    }
  } finally {
    prompts.close();
  }
}

/** Resolve a checkout project using the caller's selected identity and client. */
export async function resolveProjectSelection(
  config,
  {
    credential,
    client,
    cwd = process.cwd(),
    project,
    org,
    interactive = false,
    selectProject = pickProject,
  } = {}
) {
  if (project || org) {
    return {
      project:
        project && org ? { organizationSlug: org, projectSlug: project } : null,
      projectQuery: {
        ...(project ? { project } : {}),
        ...(org ? { organization: org } : {}),
      },
      source: 'explicit',
    };
  }
  let unmatched = { project: null, projectQuery: {}, source: null };
  if (credential?.kind !== 'user') return unmatched;
  if (config.project)
    return selectedProject(config.project, config._projectSource || 'config');
  let repository = await getRepositoryInfo(cwd);
  if (!repository) return unmatched;
  let repositories = [
    ...new Set(
      repository.remotes
        .map(remote => normalizeRepositoryRemote(remote.url))
        .filter(Boolean)
    ),
  ].sort();
  if (repositories.length === 0) return unmatched;
  requireCredentialScope(credential, 'read');
  let pages = await Promise.all(
    repositories.map(repository => repositoryProjects(client, repository))
  );
  let candidates = [
    ...new Map(pages.flat().map(item => [item.id, item])).values(),
  ];
  if (candidates.some(item => !item.organizationSlug || !item.slug)) {
    throw new VizzlyError(
      'Invalid project discovery response.',
      'INVALID_PROJECT_RESPONSE'
    );
  }
  if (candidates.length === 0) return { ...unmatched, repositories };
  let scope = {
    apiUrl: config.apiUrl,
    directory: config._configPath
      ? dirname(resolve(cwd, config._configPath))
      : repository.root,
    repositories,
  };
  let saved = await readProjectSelection(scope);
  let selected = candidates.find(project => project.id === saved?.id);
  let source = 'saved-selection';
  if (!selected && candidates.length === 1) {
    selected = candidates[0];
    source = 'repository';
  }
  if (!selected) {
    if (!interactive) {
      let selectors = candidates.map(project => ({
        id: project.id,
        organizationSlug: project.organizationSlug,
        projectSlug: project.slug,
      }));
      throw new VizzlyError(
        `Multiple projects match this checkout: ${selectors.map(project => `${project.organizationSlug}/${project.projectSlug}`).join(', ')}. Choose a project with --project and --org, or run interactively.`,
        'PROJECT_SELECTION_AMBIGUOUS',
        { repositories, candidates: selectors }
      );
    }
    let choice = await selectProject(candidates);
    if (!choice) {
      throw new VizzlyError('Project selection cancelled.', 'PROMPT_CANCELLED');
    }
    selected = candidates.find(project => project.id === choice.id);
    if (!selected) {
      throw new VizzlyError(
        'Choose one of the connected projects.',
        'INVALID_PROJECT_SELECTION'
      );
    }
    await saveProjectSelection(scope, selected);
    source = 'saved-selection';
  }
  return selectedProject(
    {
      organizationSlug: selected.organizationSlug,
      projectSlug: selected.slug,
    },
    source,
    repositories
  );
}
