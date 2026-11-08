import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient } from '../auth/cloud-client.js';
import {
  credentialInfo,
  requireCredentialScope,
} from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';

export function uploadDestinationInfo(destination) {
  if (!destination) return destination;
  return {
    ...destination,
    credential: destination.credential
      ? credentialInfo(destination.credential)
      : null,
  };
}

/**
 * Read the organization and project a token belongs to.
 *
 * @param {Object} client - API client
 * @returns {Promise<Object>} Token organization and project
 */
export async function getTokenContext(client) {
  return client.request('/api/sdk/token/context');
}

function uploadPermission(credential) {
  let scopes = credential.authorization?.scopes;
  if (!Array.isArray(scopes)) return 'unknown';
  return scopes.includes('builds:write') ? 'granted' : 'missing';
}

/** Resolve identity separately from the checkout's intended upload project. */
export async function resolveUploadDestination(config) {
  let result = {
    apiUrl: config.apiUrl,
    configured: config.project || null,
    effective: null,
    credential: null,
    status: 'unconfigured',
    matches: null,
    projectQuery: {},
    uploadPermission: 'unknown',
  };
  let credential = resolveCredential(config, {
    allowNoToken: true,
    command: 'upload',
  });
  if (!credential.token) return result;
  result.credential = credential;
  result.uploadPermission = uploadPermission(credential);
  if (credential.source === 'user' && !config.project) return result;
  result.status = 'unverified';
  let client = createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command: 'project-status',
  });
  if (credential.source === 'user') {
    let identity = await client.request('/api/auth/cli/whoami');
    result.credential = {
      ...credential,
      token: client.getToken(),
      authorization: identity.authorization || credential.authorization,
    };
    result.effective = config.project;
    result.matches = true;
    result.projectQuery = {
      project: config.project.projectSlug,
      organization: config.project.organizationSlug,
    };
    result.uploadPermission = uploadPermission(result.credential);
    return result;
  }
  let context = await getTokenContext(client);
  if (!context.organization?.slug || !context.project?.slug) {
    throw new VizzlyError(
      'This credential has no upload project. Run vizzly project link <org>/<project>.',
      'UPLOAD_PROJECT_REQUIRED'
    );
  }
  result.effective = {
    organizationSlug: context.organization.slug,
    projectSlug: context.project.slug,
  };
  result.status = 'verified';
  result.uploadPermission = 'granted';
  result.matches =
    !result.configured ||
    (result.configured.organizationSlug === result.effective.organizationSlug &&
      result.configured.projectSlug === result.effective.projectSlug);
  return result;
}

export async function requireUploadDestination(config) {
  let destination = await resolveUploadDestination(config);
  if (!destination.effective) {
    throw new VizzlyError(
      'Log in and choose an upload destination with vizzly project link <org>/<project>, or set VIZZLY_TOKEN.',
      'UPLOAD_PROJECT_REQUIRED'
    );
  }
  requireCredentialScope(destination.credential, 'builds:write');
  if (!destination.matches) {
    throw new VizzlyError(
      `Upload token targets ${destination.effective.organizationSlug}/${destination.effective.projectSlug}, but this checkout is configured for ${destination.configured.organizationSlug}/${destination.configured.projectSlug}. Remove the token override or link the intended project before uploading.`,
      'UPLOAD_PROJECT_MISMATCH'
    );
  }
  return destination;
}
