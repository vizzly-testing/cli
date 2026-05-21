import { createApiClient as defaultCreateApiClient } from '../api/client.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import { getAccessToken as defaultGetAccessToken } from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';
import { saveProjectLink as defaultSaveProjectLink } from '../utils/project-link-store.js';

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
    saveProjectLink = defaultSaveProjectLink,
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
    let config = await loadConfig(globalOptions.config, globalOptions);
    let userToken = config.userToken || (await getAccessToken());

    if (!userToken) {
      output.error('Login required before linking a project');
      output.hint('Run "vizzly login" first, then try project link again');
      output.cleanup();
      exit(1);
      return;
    }

    output.startSpinner(`Linking ${organizationSlug}/${projectSlug}...`);

    let apiUrl = config.apiUrl || getApiUrl();
    let client = createApiClient({
      baseUrl: apiUrl,
      token: userToken,
      command: 'project-link',
    });

    let response = await client.request(`/api/cli/${projectSlug}/link-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Organization': organizationSlug,
      },
      body: JSON.stringify({
        name: options.name,
        expiresAt: options.expiresAt,
      }),
    });

    let linkedProject = await saveProjectLink({
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

    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        linked: true,
        organizationSlug: linkedProject.organizationSlug,
        projectSlug: linkedProject.projectSlug,
        tokenPrefix: linkedProject.tokenPrefix,
        storage: linkedProject.storage,
      });
      output.cleanup();
      return;
    }

    output.complete(
      `Linked ${linkedProject.organizationSlug}/${linkedProject.projectSlug}`
    );
    output.hint(
      `Active project: ${linkedProject.organizationSlug}/${linkedProject.projectSlug}`
    );
    output.hint(
      `Cloud uploads and project-scoped context will use ${linkedProject.tokenPrefix}...`
    );
    output.hint(`Credential storage: ${linkedProject.storage}`);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to link project', error);
    output.cleanup();
    exit(1);
  }
}
