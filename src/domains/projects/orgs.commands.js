import * as defaultOutput from '../../shared/output.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { credentialInfo } from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';
import { showCredential } from '../auth/credential-presentation.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../config/environment.js';
import { serializeOrganization } from './discovery.serializers.js';
import { discoverOrganizations } from './discovery.service.js';

/**
 * Organizations command - List organizations the user has access to
 */

/**
 * Organizations command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function orgsCommand(options = {}, globalOptions = {}, deps = {}) {
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
    let config = await loadConfig(globalOptions.config, {
      ...globalOptions,
      _ignoreProjectBinding: true,
    });

    let credential = resolveCredential(config, {
      ...globalOptions,
      ...options,
      command: 'orgs',
    });
    let client = createApiClient({
      baseUrl: config.apiUrl || getApiUrl(),
      token: credential.token,
      credential,
      command: 'orgs',
    });

    output.startSpinner('Fetching organizations...');

    let response = await discoverOrganizations(client, options);

    output.stopSpinner();

    let orgs = response.organizations || [];

    if (globalOptions.json) {
      output.data({
        organizations: orgs.map(serializeOrganization),
        pagination: response.pagination,
        auth: credentialInfo(credential),
        count: orgs.length,
      });
    } else {
      output.header('orgs');
      showCredential(output, credential);

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
          let details = [
            org.projectCount != null ? `${org.projectCount} projects` : null,
            roleLabel,
          ]
            .filter(Boolean)
            .join(' · ');
          if (details) output.print(`    ${colors.dim(details)}`);
        }
      }
      if (response.pagination.hasMore)
        output.hint(
          response.pagination.nextOffset !== null
            ? `Use --offset ${response.pagination.nextOffset} to see more`
            : 'API paging limit reached.'
        );
      output.hint('List projects: vizzly projects --org <org-slug>');
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch organizations', error);
    output.cleanup();
    exit(1);
  }
}
