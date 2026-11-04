import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient } from '../auth/cloud-client.js';
import { credentialInfo, selectCredential } from '../auth/credential.rules.js';

/** Resolve the effective upload token, independently of the saved user login. */
export async function resolveUploadDestination(config) {
  let result = {
    apiUrl: config.apiUrl,
    configured: config.project || null,
    effective: null,
    credential: null,
    status: 'unconfigured',
    matches: null,
  };
  if (!config.apiKey) return result;
  let credential = selectCredential(config, { auth: 'token' });
  result.credential = credentialInfo(credential);
  result.status = 'unverified';
  let client = createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command: 'project-status',
  });
  let context = await client.request('/api/sdk/token/context');
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
  result.matches =
    !result.configured ||
    (result.configured.organizationSlug === result.effective.organizationSlug &&
      result.configured.projectSlug === result.effective.projectSlug);
  return result;
}

export async function requireUploadDestination(config) {
  let destination = await resolveUploadDestination(config);
  if (destination.status !== 'verified') {
    throw new VizzlyError(
      'Choose an upload destination with vizzly project link or set VIZZLY_TOKEN.',
      'UPLOAD_PROJECT_REQUIRED'
    );
  }
  if (!destination.matches) {
    throw new VizzlyError(
      `Upload token targets ${destination.effective.organizationSlug}/${destination.effective.projectSlug}, but this checkout is configured for ${destination.configured.organizationSlug}/${destination.configured.projectSlug}. Remove the token override or link the intended project before uploading.`,
      'UPLOAD_PROJECT_MISMATCH'
    );
  }
  return destination;
}
