import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import {
  ENVIRONMENT_NAMES,
  selectEnvironment,
} from '../utils/environment-profile.js';
import {
  loadGlobalConfig as defaultLoadGlobalConfig,
  saveGlobalConfig as defaultSaveGlobalConfig,
} from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Keep environment and credential diagnostics on the same resolved state used
 * by API commands.
 *
 * @param {Object} config - Fully resolved CLI configuration.
 * @returns {Object} Safe environment and credential facts.
 */
export function createEnvironmentStatus(config) {
  return {
    environment: config.environmentContext,
    credential: config.credential,
    userAuthAvailable: Boolean(config.userToken),
    linkedProject: config.linkedProject
      ? {
          organization: config.linkedProject.organizationSlug,
          project: config.linkedProject.projectSlug,
          storage: config.linkedProject.storage,
        }
      : null,
  };
}

function configureOutput(output, globalOptions) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });
}

function writeEnvironmentStatus(output, status) {
  output.header('environment');
  output.keyValue({
    Environment: status.environment.name,
    'API URL': status.environment.apiUrl,
    Origin: status.environment.origin,
    Source: status.environment.source,
    Credential: status.credential.kind,
    'Token prefix': status.credential.tokenPrefix || 'not configured',
    'User login': status.userAuthAvailable ? 'valid' : 'not available',
  });

  if (status.linkedProject) {
    output.blank();
    output.labelValue(
      'Linked project',
      `${status.linkedProject.organization}/${status.linkedProject.project}`
    );
    output.hint(`Credential storage: ${status.linkedProject.storage}`);
  }
}

export async function environmentShowCommand(
  _options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  configureOutput(output, globalOptions);

  try {
    let config = await loadConfig(globalOptions.config, globalOptions);
    let status = createEnvironmentStatus(config);

    if (globalOptions.json) {
      output.data(status);
    } else {
      writeEnvironmentStatus(output, status);
    }
  } catch (error) {
    output.error('Failed to read the Vizzly environment', error);
    exit(1);
  } finally {
    output.cleanup();
  }
}

export async function environmentUseCommand(
  name,
  _options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    env = process.env,
    loadConfig = defaultLoadConfig,
    loadGlobalConfig = defaultLoadGlobalConfig,
    output = defaultOutput,
    saveGlobalConfig = defaultSaveGlobalConfig,
    exit = code => process.exit(code),
  } = deps;

  configureOutput(output, globalOptions);

  try {
    if (env.VIZZLY_API_URL) {
      throw new Error(
        'Clear VIZZLY_API_URL before changing the persisted environment'
      );
    }

    let globalConfig = await loadGlobalConfig();
    await saveGlobalConfig(selectEnvironment(globalConfig, name));
    let config = await loadConfig(globalOptions.config, globalOptions);
    let status = createEnvironmentStatus(config);

    if (globalOptions.json) {
      output.data({ changed: true, ...status });
    } else {
      output.complete(`Using the ${name} environment`);
      output.blank();
      writeEnvironmentStatus(output, status);
    }
  } catch (error) {
    output.error('Failed to change the Vizzly environment', error);
    exit(1);
  } finally {
    output.cleanup();
  }
}

export function validateEnvironmentName(name) {
  if (ENVIRONMENT_NAMES.includes(name)) {
    return [];
  }

  return [
    `Unknown environment "${name}". Use ${ENVIRONMENT_NAMES.join(' or ')}.`,
  ];
}
