import { preflightChanges } from '../../shared/file-changes.js';
import * as defaultOutput from '../../shared/output.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { resolveCredential } from '../auth/credential.service.js';
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
import {
  getProjectLink as defaultGetProjectLink,
  saveProjectLink as defaultSaveProjectLink,
} from './project-link-store.js';
import { pickProject } from './project-picker.service.js';

export async function projectLinkCommand(
  selector,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createApiClient = defaultCreateApiClient,
    getApiUrl = defaultGetApiUrl,
    loadConfig = defaultLoadConfig,
    output = defaultOutput,
    getProjectLink = defaultGetProjectLink,
    planProjectBinding = defaultPlanProjectBinding,
    saveProjectLink = defaultSaveProjectLink,
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
      if (
        globalOptions.json ||
        !process.stdin.isTTY ||
        !process.stdout.isTTY ||
        process.env.CI
      ) {
        throw new VizzlyError(
          'Choose an upload destination: vizzly project link <org>/<project>. Run vizzly projects --auth user to discover projects, or run project link interactively.',
          'PROJECT_INPUT_REQUIRED'
        );
      }
      if (configError) throw configError;
      let selected = await pickProject(config, {
        ...globalOptions,
        ...options,
        org: organizationSlug,
      });
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

    if (binding.after !== null) {
      await preflightChanges([
        {
          path: binding.configPath,
          before: binding.before,
          after: binding.after,
        },
      ]);
    }

    let linkedProject =
      !options.name && !options.expiresAt
        ? await getProjectLink({ apiUrl, ...project })
        : null;
    let reused = Boolean(linkedProject);
    let userToken = linkedProject
      ? null
      : config.userToken || globalOptions.token;

    if (!linkedProject && !userToken) {
      output.error('Login required before linking a project');
      output.hint('Run "vizzly login" first, then try project link again');
      output.cleanup();
      exit(1);
      return { linked: false, reason: 'auth_required' };
    }

    if (!linkedProject) {
      output.startSpinner(`Linking ${organizationSlug}/${projectSlug}...`);
      let credential = resolveCredential(config, {
        ...globalOptions,
        auth: globalOptions.token ? 'auto' : 'user',
        command: 'project link',
      });
      let client = createApiClient({
        baseUrl: apiUrl,
        token: credential.token,
        credential,
        command: 'project-link',
      });
      let response = await client.request(
        `/api/cli/${projectSlug}/link-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization': organizationSlug,
          },
          body: JSON.stringify({
            name: options.name,
            expiresAt: options.expiresAt,
          }),
        }
      );
      linkedProject = await saveProjectLink({
        apiUrl,
        organizationSlug: response.organization?.slug || organizationSlug,
        organizationName: response.organization?.name,
        projectSlug: response.project?.slug || projectSlug,
        projectName: response.project?.name,
        token: response.token.token,
        tokenId: response.token.id,
        tokenPrefix: response.token.token_prefix,
        expiresAt: response.token.expires_at,
        createdAt: response.token.created_at,
      });
    }

    if (
      linkedProject.organizationSlug !== organizationSlug ||
      linkedProject.projectSlug !== projectSlug
    ) {
      binding = await planProjectBinding({
        configPath: binding.configPath,
        project: {
          organizationSlug: linkedProject.organizationSlug,
          projectSlug: linkedProject.projectSlug,
        },
        apiUrl,
        currentProject: config?.project,
        currentApiUrl: config?._configApiUrl,
      });
      if (binding.status === 'manual') throw new Error(binding.instructions);
    }
    await writeProjectBinding(binding);

    output.stopSpinner();

    let result = {
      linked: true,
      organizationSlug: linkedProject.organizationSlug,
      projectSlug: linkedProject.projectSlug,
      tokenPrefix: linkedProject.tokenPrefix,
      storage: linkedProject.storage,
      reused,
      binding: { status: 'bound', configPath: binding.configPath },
    };
    if (globalOptions.json) {
      output.data(result);
      output.cleanup();
      return result;
    }

    output.complete(
      `Linked ${linkedProject.organizationSlug}/${linkedProject.projectSlug}`
    );
    output.hint(
      `Repository project: ${linkedProject.organizationSlug}/${linkedProject.projectSlug}`
    );
    output.hint(
      'Cloud uploads use this project credential. Browse other projects with --auth user.'
    );
    output.hint(`Credential storage: ${linkedProject.storage}`);
    output.cleanup();
    return result;
  } catch (error) {
    output.stopSpinner();
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
