/**
 * Review commands - approve, reject, and comment on comparisons/builds
 */

import { createApiClient as defaultCreateApiClient } from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Approve a comparison
 * @param {string} comparisonId - Comparison ID to approve
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function approveCommand(comparisonId, options = {}, globalOptions = {}, deps = {}) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    if (!config.apiKey) {
      output.error('API token required');
      output.hint('Use --token or set VIZZLY_TOKEN environment variable');
      exit(1);
      return;
    }

    output.startSpinner('Approving comparison...');

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'approve',
    });

    let body = {};
    if (options.comment) {
      body.comment = options.comment;
    }

    let response = await client.request(`/api/sdk/comparisons/${comparisonId}/approve`, {
      method: 'POST',
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      headers: Object.keys(body).length > 0 ? { 'Content-Type': 'application/json' } : undefined,
    });

    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        approved: true,
        comparisonId,
        comparison: response.comparison,
      });
      output.cleanup();
      return;
    }

    output.complete(`Comparison ${comparisonId} approved`);
    if (options.comment) {
      output.hint(`Comment: "${options.comment}"`);
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        approved: false,
        comparisonId,
        error: { message: error.message, code: error.code },
      });
      output.cleanup();
      exit(1);
      return;
    }

    output.error('Failed to approve comparison', error);
    exit(1);
  }
}

/**
 * Reject a comparison
 * @param {string} comparisonId - Comparison ID to reject
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function rejectCommand(comparisonId, options = {}, globalOptions = {}, deps = {}) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    if (!config.apiKey) {
      output.error('API token required');
      output.hint('Use --token or set VIZZLY_TOKEN environment variable');
      exit(1);
      return;
    }

    if (!options.reason) {
      output.error('Reason required when rejecting');
      output.hint('Use --reason "explanation" to provide a reason');
      exit(1);
      return;
    }

    output.startSpinner('Rejecting comparison...');

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'reject',
    });

    let response = await client.request(`/api/sdk/comparisons/${comparisonId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: options.reason }),
      headers: { 'Content-Type': 'application/json' },
    });

    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        rejected: true,
        comparisonId,
        reason: options.reason,
        comparison: response.comparison,
      });
      output.cleanup();
      return;
    }

    output.complete(`Comparison ${comparisonId} rejected`);
    output.hint(`Reason: "${options.reason}"`);

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        rejected: false,
        comparisonId,
        error: { message: error.message, code: error.code },
      });
      output.cleanup();
      exit(1);
      return;
    }

    output.error('Failed to reject comparison', error);
    exit(1);
  }
}

/**
 * Add a comment to a build
 * @param {string} buildId - Build ID to comment on
 * @param {string} message - Comment message
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function commentCommand(buildId, message, options = {}, globalOptions = {}, deps = {}) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    if (!config.apiKey) {
      output.error('API token required');
      output.hint('Use --token or set VIZZLY_TOKEN environment variable');
      exit(1);
      return;
    }

    if (!message || message.trim() === '') {
      output.error('Comment message required');
      exit(1);
      return;
    }

    output.startSpinner('Adding comment...');

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'comment',
    });

    let body = {
      content: message,
      type: options.type || 'general',
    };

    let response = await client.request(`/api/sdk/builds/${buildId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        created: true,
        buildId,
        comment: response.comment,
      });
      output.cleanup();
      return;
    }

    output.complete('Comment added');
    output.labelValue('Build', buildId);
    output.labelValue('Message', message);

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        created: false,
        buildId,
        error: { message: error.message, code: error.code },
      });
      output.cleanup();
      exit(1);
      return;
    }

    output.error('Failed to add comment', error);
    exit(1);
  }
}
