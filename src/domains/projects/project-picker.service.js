import * as output from '../../shared/output.js';
import { createPrompts } from '../../shared/terminal-prompts.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient } from '../auth/cloud-client.js';
import { requireCredentialScope } from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';
import { discoverProjects } from './discovery.service.js';
import {
  isProjectSelectionInteractive,
  resolveProjectSelection,
} from './project-selection.service.js';

/** A paged selection; selecting a project does not link or issue credentials. */
export async function pickProject(config, options = {}, prompts = null) {
  let credential = resolveCredential(config, {
    ...options,
    auth: options.token ? 'auto' : 'user',
    command: 'project link',
  });
  requireCredentialScope(credential, 'read');
  let client = createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command: 'project-link',
  });
  let reader = prompts || createPrompts();
  let org = options.org;
  let offset = 0;
  try {
    while (true) {
      let page = await discoverProjects(client, { org, offset, limit: 10 });
      output.labelValue(
        'Upload projects',
        `${page.projects.length} of ${page.pagination.total}`
      );
      if (page.projects.length === 0)
        output.hint('No accessible projects in this view.');
      page.projects.forEach((project, index) => {
        output.print(
          `  ${index + 1}. ${project.organizationSlug}/${project.slug} (${project.name})`
        );
      });
      let actions = [
        page.pagination.nextOffset !== null ? 'n: next page' : null,
        offset > 0 ? 'b: first page' : null,
        'o: filter organization',
        'q: cancel',
      ].filter(Boolean);
      output.hint(actions.join(' · '));
      let answer = await reader.ask('Choose project number or action');
      if (answer === 'q') return null;
      if (answer === 'o') {
        org = await reader.ask('Organization slug (empty for all)');
        offset = 0;
        continue;
      }
      if (answer === 'b') {
        offset = 0;
        continue;
      }
      if (answer === 'n' && page.pagination.nextOffset !== null) {
        offset = page.pagination.nextOffset;
        continue;
      }
      let selected = /^\d+$/.test(answer)
        ? page.projects[Number(answer) - 1]
        : null;
      if (selected) {
        return {
          organizationSlug: selected.organizationSlug,
          projectSlug: selected.slug,
        };
      }
      output.hint('Enter a project number or one of the listed actions.');
    }
  } finally {
    if (!prompts) reader.close();
  }
}

/** Use the checkout's repository before offering the full account picker. */
export async function chooseProject(config, options = {}) {
  let credential = resolveCredential(config, {
    ...options,
    auth: options.token ? 'auto' : 'user',
    command: 'project link',
  });
  let client = createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command: 'project-link',
  });
  let interactive = isProjectSelectionInteractive();
  let selection = await resolveProjectSelection(config, {
    credential,
    client,
    org: options.org,
    interactive,
  });
  if (selection.project) return selection.project;
  if (!interactive) {
    throw new VizzlyError(
      'Choose an upload destination with vizzly project link <org>/<project>. No connected project was detected for this checkout.',
      'PROJECT_INPUT_REQUIRED'
    );
  }
  return pickProject(config, options);
}
