import { createApiClient as defaultCreateApiClient } from '../api/client.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import { preflightChanges } from '../utils/file-changes.js';
import { getAccessToken as defaultGetAccessToken } from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';
import {
  planProjectBinding as defaultPlanProjectBinding,
  writeProjectBinding as defaultWriteProjectBinding,
} from '../utils/project-binding.js';
import {
  getProjectLink as defaultGetProjectLink,
  saveProjectLink as defaultSaveProjectLink,
} from '../utils/project-link-store.js';

export function parseProjectSelector(selector, options = {}) {
  let organizationSlug = options.org || null;
  let projectSlug = options.project || null;

  if (selector) {
    let parts = selector.split('/');
    if (parts.length === 2) {
      organizationSlug = organizationSlug || parts[0];
      projectSlug = projectSlug || parts[1];
    } else if (parts.length === 1) {
      projectSlug = projectSlug || parts[0];
    }
  }

  return { organizationSlug, projectSlug };
}

export function validateProjectLinkOptions(selector, options = {}) {
  let errors = [];
  let { organizationSlug, projectSlug } = parseProjectSelector(
    selector,
    options
  );

  if (!organizationSlug) {
    errors.push(
      'Organization is required. Use <org>/<project> or --org <slug>.'
    );
  }
  if (!projectSlug) {
    errors.push(
      'Project is required. Use <org>/<project> or --project <slug>.'
    );
  }

  return errors;
}

export async function projectLinkCommand(
  selector,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createApiClient = defaultCreateApiClient,
    getAccessToken = defaultGetAccessToken,
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
      : config.userToken || globalOptions.token || (await getAccessToken());

    if (!linkedProject && !userToken) {
      output.error('Login required before linking a project');
      output.hint('Run "vizzly login" first, then try project link again');
      output.cleanup();
      exit(1);
      return { linked: false, reason: 'auth_required' };
    }

    if (!linkedProject) {
      output.startSpinner(`Linking ${organizationSlug}/${projectSlug}...`);
      let client = createApiClient({
        baseUrl: apiUrl,
        token: userToken,
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
      `Cloud uploads and project-scoped context will use ${linkedProject.tokenPrefix}...`
    );
    output.hint(`Credential storage: ${linkedProject.storage}`);
    output.cleanup();
    return result;
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to link project', error);
    output.cleanup();
    exit(1);
    return { linked: false, reason: 'link_failed' };
  }
}
