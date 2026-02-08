/**
 * Projects command - List projects the user has access to
 */

import { createApiClient } from '../api/client.js';
import { loadConfig } from '../utils/config-loader.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAccessToken } from '../utils/global-config.js';
import * as output from '../utils/output.js';

/**
 * Projects command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function projectsCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let config = await loadConfig(globalOptions.config, globalOptions);

    // Prefer user auth token for listing projects — project-scoped tokens only see one org
    let token = (await getAccessToken()) || config.apiKey;

    if (!token) {
      output.error(
        'API token required. Use --token, set VIZZLY_TOKEN, or run "vizzly login"'
      );
      output.cleanup();
      process.exit(1);
    }

    let client = createApiClient({
      baseUrl: config.apiUrl || getApiUrl(),
      token,
    });

    // Build query params
    let params = new URLSearchParams();
    if (options.org) params.set('organization', options.org);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    let queryString = params.toString();
    let endpoint = `/api/sdk/projects${queryString ? `?${queryString}` : ''}`;

    output.startSpinner('Fetching projects...');

    let response = await client.request(endpoint);

    output.stopSpinner();

    let projects = response.projects || [];
    let pagination = response.pagination || {};

    if (globalOptions.json) {
      output.data({
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          organizationName: p.organizationName,
          organizationSlug: p.organizationSlug,
          buildCount: p.buildCount,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
        pagination,
      });
    } else {
      output.header('projects');

      let colors = output.getColors();

      if (projects.length === 0) {
        output.print('  No projects found');
        if (options.org) {
          output.hint(`No projects in organization "${options.org}"`);
        }
      } else {
        output.labelValue(
          'Showing',
          `${projects.length} of ${pagination.total}`
        );
        output.blank();

        for (let project of projects) {
          output.print(
            `  ${colors.bold(project.name)} ${colors.dim(`@${project.organizationSlug}/${project.slug}`)}`
          );
          output.print(`    ${colors.dim(`${project.buildCount} builds`)}`);
        }

        if (pagination.hasMore) {
          output.blank();
          output.hint(
            `Use --offset ${(options.offset || 0) + projects.length} to see more`
          );
        }
      }
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch projects', error);
    output.cleanup();
    process.exit(1);
  }
}

/**
 * Validate projects options
 * @param {Object} _options - Command options
 * @returns {string[]} Validation errors
 */
export function validateProjectsOptions(_options = {}) {
  return [];
}
