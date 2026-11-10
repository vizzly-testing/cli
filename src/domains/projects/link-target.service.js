import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient } from '../auth/cloud-client.js';
import {
  credentialInfo,
  requireCredentialScope,
} from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';
import { discoverProjects } from './discovery.service.js';

export function createProjectSelectionClient(config, options = {}) {
  let credential = resolveCredential(config, {
    ...options,
    auth: options.auth || 'auto',
    command: 'project link',
  });
  requireCredentialScope(credential, 'read');
  let client = createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command: 'project-link',
  });
  return { client, credential };
}

/** Resolve an exact qualified name using the caller's selected credential. */
export async function resolveLinkTarget(config, target, options = {}) {
  let { client, credential } = createProjectSelectionClient(config, options);
  let offset = 0;
  let candidates = [];
  while (offset !== null) {
    let page = await discoverProjects(client, {
      org: target.organizationSlug,
      limit: 250,
      offset,
    });
    let selected = page.projects.find(
      project =>
        project.organizationSlug?.toLowerCase() === target.organizationSlug &&
        project.slug?.toLowerCase() === target.projectSlug
    );
    if (selected) {
      return {
        ...target,
        projectId: selected.id,
        auth: credentialInfo(credential),
      };
    }
    candidates.push(
      ...page.projects.slice(0, 50 - candidates.length).map(project => ({
        projectId: project.id,
        selector: `${project.organizationSlug}/${project.slug}`,
      }))
    );
    offset = page.pagination.nextOffset;
  }
  throw new VizzlyError(
    `No accessible project matches ${target.organizationSlug}/${target.projectSlug}. Run vizzly projects to find a destination, or pass a known project UUID to save it locally.`,
    'PROJECT_LINK_REQUIRED',
    { candidates }
  );
}
