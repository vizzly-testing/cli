import * as output from '../../shared/output.js';
import { resolveCredential } from '../auth/credential.service.js';
import { credentialSourceLabel } from '../auth/credential-presentation.js';
import { loadConfig } from '../config/config-loader.js';
import { showProjectSelection } from './project-presentation.js';
import {
  resolveUploadDestination,
  uploadDestinationInfo,
} from './upload-destination.service.js';

function projectLabel(project) {
  return project
    ? `${project.organizationSlug}/${project.projectSlug}`
    : 'none';
}

export async function projectStatusCommand(_options = {}, globalOptions = {}) {
  output.configure({ json: globalOptions.json, color: !globalOptions.noColor });
  try {
    let config = await loadConfig(globalOptions.config, globalOptions);
    let destination;
    try {
      destination = await resolveUploadDestination(config);
    } catch (error) {
      if (error.code !== 'NETWORK_ERROR' && !(error.context?.status >= 500))
        throw error;
      destination = {
        apiUrl: config.apiUrl,
        configured: config.project || null,
        effective: null,
        credential: resolveCredential(config, { allowNoToken: true }),
        status: 'unverified',
        matches: null,
        error: { code: error.code, message: error.message },
      };
    }
    if (globalOptions.json) output.data(uploadDestinationInfo(destination));
    else {
      output.header('project');
      showProjectSelection(output, {
        ...destination,
        project: destination.effective,
      });
      output.labelValue('API', destination.apiUrl);
      output.labelValue(
        'Checkout project',
        projectLabel(destination.configured)
      );
      output.labelValue(
        'Upload destination',
        destination.status === 'unverified'
          ? destination.effective
            ? `${projectLabel(destination.effective)} (access checked on upload)`
            : 'unverified (unable to reach Vizzly)'
          : projectLabel(destination.effective)
      );
      if (destination.credential?.source === 'user') {
        output.labelValue(
          'Build permission',
          destination.uploadPermission || 'unknown'
        );
      }
      output.labelValue(
        'Credential',
        destination.credential
          ? credentialSourceLabel(destination.credential.source)
          : 'none'
      );
      if (destination.matches === false)
        output.warn(
          'The upload token does not match this checkout. Uploads will fail until corrected.'
        );
      if (!destination.effective)
        output.hint('Choose uploads: vizzly project link');
      output.hint('Browse projects: vizzly projects --auth user');
    }
    output.cleanup();
  } catch (error) {
    output.error('Failed to inspect upload destination', error);
    output.cleanup();
    process.exitCode = 1;
  }
}
