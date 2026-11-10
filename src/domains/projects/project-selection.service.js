import { VizzlyError } from '../../shared/vizzly-error.js';

export function projectLinkRequired(config) {
  let link = config._directoryProject;
  let directory = link?.directory || process.cwd();
  return new VizzlyError(
    'Choose a project for this directory with vizzly project link <org>/<project>.',
    'PROJECT_LINK_REQUIRED',
    {
      scope: { directory, path: link?.path, root: link?.root },
      recovery: {
        command: 'vizzly project link',
        argv: ['project', 'link', '<org>/<project>', '--directory', directory],
      },
    }
  );
}

export function resolveProjectSelection(config, options = {}) {
  if (options.project || options.org) {
    return {
      source: 'explicit',
      projectQuery: {
        ...(options.project ? { project: options.project } : {}),
        ...(options.org ? { organization: options.org } : {}),
      },
    };
  }
  if (options.credential && options.credential.source !== 'user') return null;
  let link = config._directoryProject;
  if (link?.binding) {
    return {
      source: 'directory',
      projectId: link.binding.projectId,
      apiOrigin: link.binding.apiOrigin,
      path: link.path,
      directory: link.directory,
      projectQuery: { project: link.binding.projectId },
    };
  }
  if (config.project) {
    return {
      source: config._projectSource || 'config',
      projectQuery: {
        project: config.project.projectSlug,
        organization: config.project.organizationSlug,
      },
    };
  }
  if (options.required === false) return null;
  throw projectLinkRequired(config);
}

export function projectLabel(project) {
  if (!project) return 'none';
  return (
    project.projectId || `${project.organizationSlug}/${project.projectSlug}`
  );
}

export function projectSelectionExplanation(selection) {
  let project =
    selection.projectId ||
    [selection.projectQuery.organization, selection.projectQuery.project]
      .filter(Boolean)
      .join('/');
  let source = selection.path ? ` (from ${selection.path})` : '';
  return `Project: ${project}${source}`;
}
