import * as defaultOutput from '../../shared/output.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../config/environment.js';
import {
  parseProjectSelector,
  validateProjectLinkOptions,
} from './project.validations.js';
import {
  planProjectBinding as defaultPlanProjectBinding,
  writeProjectBinding as defaultWriteProjectBinding,
} from './project-binding.js';
import { chooseProject } from './project-picker.service.js';

export async function projectLinkCommand(
  selector,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    getApiUrl = defaultGetApiUrl,
    loadConfig = defaultLoadConfig,
    output = defaultOutput,
    planProjectBinding = defaultPlanProjectBinding,
    writeProjectBinding = defaultWriteProjectBinding,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let { organizationSlug, projectSlug } = parseProjectSelector(
    selector,
    options
  );

  try {
    if (options.name || options.expiresAt) {
      throw new VizzlyError(
        'Project linking saves an upload destination. Create automation tokens in the project API token settings.',
        'PROJECT_TOKEN_OPTIONS_UNSUPPORTED'
      );
    }
    let config;
    let configError;
    try {
      config = await loadConfig(globalOptions.config, globalOptions);
    } catch (error) {
      configError = error;
    }
    if ((selector || options.project) && (!organizationSlug || !projectSlug)) {
      throw new VizzlyError(
        validateProjectLinkOptions(selector, options).join(' '),
        'PROJECT_INPUT_REQUIRED'
      );
    }
    if (!organizationSlug || !projectSlug) {
      if (configError) throw configError;
      let selected = await chooseProject(
        { ...config, project: null },
        {
          ...globalOptions,
          ...options,
          org: organizationSlug,
        }
      );
      if (!selected) {
        output.hint('Project selection cancelled; no files changed.');
        output.cleanup();
        return { linked: false, reason: 'cancelled' };
      }
      organizationSlug = selected.organizationSlug;
      projectSlug = selected.projectSlug;
    }
    let errors = validateProjectLinkOptions(
      `${organizationSlug}/${projectSlug}`
    );
    if (errors.length)
      throw new VizzlyError(errors.join(' '), 'PROJECT_INPUT_REQUIRED');
    organizationSlug = organizationSlug.toLowerCase();
    projectSlug = projectSlug.toLowerCase();
    let apiUrl = config?.apiUrl || getApiUrl();
    let project = { organizationSlug, projectSlug };
    let binding = await planProjectBinding({
      configPath: globalOptions.config || config?._configPath,
      project,
      apiUrl,
      currentProject: config?.project,
      currentApiUrl: config?._configApiUrl,
    });

    if (binding.status === 'manual') {
      let result = {
        linked: false,
        organizationSlug,
        projectSlug,
        binding: {
          status: 'manual',
          configPath: binding.configPath,
          instructions: binding.instructions,
        },
      };
      if (globalOptions.json) output.data(result);
      else {
        output.error('Project configuration needs an explicit edit');
        output.hint(binding.instructions);
      }
      output.cleanup();
      exit(2);
      return result;
    }

    if (configError) throw configError;

    await writeProjectBinding(binding);

    let result = {
      linked: true,
      organizationSlug,
      projectSlug,
      binding: { status: 'bound', configPath: binding.configPath },
    };
    if (globalOptions.json) {
      output.data(result);
      output.cleanup();
      return result;
    }

    output.complete(`Linked ${organizationSlug}/${projectSlug}`);
    output.hint(
      'Uploads use your saved login or an explicitly configured API token.'
    );
    output.hint('Vizzly checks project access when you upload.');
    output.cleanup();
    return result;
  } catch (error) {
    if (error.code === 'PROMPT_CANCELLED') {
      output.hint('Project selection cancelled; no files changed.');
      output.cleanup();
      exit(130);
      return { linked: false, reason: 'cancelled' };
    }
    output.error('Failed to link project', error);
    output.cleanup();
    exit(1);
    return {
      linked: false,
      reason: error.code === 'LOGIN_REQUIRED' ? 'auth_required' : 'link_failed',
    };
  }
}
