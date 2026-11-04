import * as defaultOutput from '../../shared/output.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { credentialInfo } from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';
import { showCredential } from '../auth/credential-presentation.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../config/environment.js';
import { serializeProject } from './discovery.serializers.js';
import { discoverProjects } from './discovery.service.js';
import { showProjectTable } from './project-presentation.js';

/**
 * Projects command - List projects the user has access to
 */

/**
 * Projects command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function projectsCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    getApiUrl = defaultGetApiUrl,
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

    let credential = resolveCredential(config, {
      ...globalOptions,
      ...options,
      command: 'projects',
    });
    let client = createApiClient({
      baseUrl: config.apiUrl || getApiUrl(),
      token: credential.token,
      credential,
      command: 'projects',
    });

    output.startSpinner('Fetching projects...');

    let response = await discoverProjects(client, options);

    output.stopSpinner();

    let { projects, pagination } = response;

    if (globalOptions.json) {
      output.data({
        projects: projects.map(serializeProject),
        auth: credentialInfo(credential),
        pagination,
      });
    } else {
      output.header('projects');
      showCredential(output, credential);

      output.blank();
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

        showProjectTable(output, projects);

        if (pagination.hasMore) {
          output.blank();
          output.hint(
            pagination.nextOffset !== null
              ? `Use --offset ${pagination.nextOffset} to see more`
              : 'API paging limit reached. Narrow the organization filter.'
          );
        }
      }
      if (projects.length > 0) {
        output.blank();
        let project = projects.length === 1 ? projects[0] : null;
        let selector = project
          ? `${project.organizationSlug}/${project.slug}`
          : '<org>/<project>';
        let buildSelector = project
          ? `--project ${project.slug} --org ${project.organizationSlug}`
          : '--project <project-slug> --org <org-slug>';
        output.hint(`Read builds: vizzly builds ${buildSelector}`);
        output.hint(`Choose uploads: vizzly project link ${selector}`);
      }
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch projects', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Validate projects options
 * @param {Object} _options - Command options
 * @returns {string[]} Validation errors
 */
export function validateProjectsOptions(options = {}) {
  let errors = [];

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 250)
  ) {
    errors.push('--limit must be an integer between 1 and 250');
  }

  if (
    options.offset !== undefined &&
    (!Number.isInteger(options.offset) ||
      options.offset < 0 ||
      options.offset > 10000)
  ) {
    errors.push('--offset must be an integer between 0 and 10000');
  }

  return errors;
}
