import { VizzlyError } from '../../shared/vizzly-error.js';
import { isProjectId } from './directory-link.validations.js';

/** An exact project UUID needs no discovery or authentication. */
export function parseLinkTarget(selector, options = {}) {
  if (selector && isProjectId(selector)) {
    if (options.org || options.project) {
      throw new VizzlyError(
        'Use either a project UUID or an organization/project selector.',
        'PROJECT_INPUT_REQUIRED'
      );
    }
    return { projectId: selector.toLowerCase() };
  }
  if (!selector && !options.project) return null;
  let parts = selector?.split('/') || [];
  let selectorOrganization = parts.length === 2 ? parts[0] : null;
  let selectorProject = parts.at(-1);
  let organizationSlug = options.org || selectorOrganization;
  let projectSlug = options.project || selectorProject;
  let conflictingOrganization =
    options.org &&
    selectorOrganization &&
    options.org.toLowerCase() !== selectorOrganization.toLowerCase();
  let conflictingProject =
    options.project &&
    selectorProject &&
    options.project.toLowerCase() !== selectorProject.toLowerCase();
  if (
    !organizationSlug ||
    !projectSlug ||
    parts.length > 2 ||
    /[\s/]/.test(organizationSlug) ||
    /[\s/]/.test(projectSlug) ||
    conflictingOrganization ||
    conflictingProject
  ) {
    throw new VizzlyError(
      'Choose a project UUID, <org>/<project>, or --org <slug> --project <slug>. Selectors and flags must agree.',
      'PROJECT_INPUT_REQUIRED'
    );
  }
  return {
    organizationSlug: organizationSlug.toLowerCase(),
    projectSlug: projectSlug.toLowerCase(),
  };
}
