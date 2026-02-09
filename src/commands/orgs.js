/**
 * Organizations command - List organizations the user has access to
 */

import { createApiClient as defaultCreateApiClient } from '../api/client.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import { getAccessToken as defaultGetAccessToken } from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Organizations command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function orgsCommand(
  _options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    getApiUrl = defaultGetApiUrl,
    getAccessToken = defaultGetAccessToken,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let config = await loadConfig(globalOptions.config, globalOptions);

    // Prefer user auth token for listing orgs (project tokens are org-scoped).
    // Falls back to config.apiKey which may be: VIZZLY_TOKEN, --token flag, or project token.
    let token = (await getAccessToken()) || config.apiKey;

    if (!token) {
      output.error(
        'API token required. Use --token, set VIZZLY_TOKEN, or run "vizzly login"'
      );
      output.cleanup();
      exit(1);
      return;
    }

    let client = createApiClient({
      baseUrl: config.apiUrl || getApiUrl(),
      token,
    });

    output.startSpinner('Fetching organizations...');

    let response = await client.request('/api/sdk/organizations');

    output.stopSpinner();

    let orgs = response.organizations || [];

    if (globalOptions.json) {
      output.data({
        organizations: orgs.map(org => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: org.role,
          projectCount: org.projectCount,
          createdAt: org.created_at,
        })),
        count: orgs.length,
      });
    } else {
      output.header('orgs');

      let colors = output.getColors();

      if (orgs.length === 0) {
        output.print('  No organizations found');
      } else {
        output.labelValue('Count', String(orgs.length));
        output.blank();

        for (let org of orgs) {
          let roleLabel = org.role === 'token' ? 'via token' : org.role;
          output.print(
            `  ${colors.bold(org.name)} ${colors.dim(`@${org.slug}`)}`
          );
          output.print(
            `    ${colors.dim(`${org.projectCount} projects · ${roleLabel}`)}`
          );
        }
      }
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch organizations', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Validate orgs options
 * @param {Object} _options - Command options
 * @returns {string[]} Validation errors
 */
export function validateOrgsOptions(_options = {}) {
  return [];
}
