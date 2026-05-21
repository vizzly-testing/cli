/**
 * Review commands - approve, reject, and comment on comparisons/builds
 */

import { createApiClient as defaultCreateApiClient } from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getAccessToken as defaultGetAccessToken } from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';

function createReviewDeps(deps = {}) {
  return {
    loadConfig: deps.loadConfig || defaultLoadConfig,
    createApiClient: deps.createApiClient || defaultCreateApiClient,
    getAccessToken: deps.getAccessToken || defaultGetAccessToken,
    output: deps.output || defaultOutput,
    exit: deps.exit || (code => process.exit(code)),
  };
}

function configureOutput(output, globalOptions) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });
}

async function loadReviewConfig({ loadConfig, options, globalOptions }) {
  let allOptions = { ...globalOptions, ...options };
  return await loadConfig(globalOptions.config, allOptions);
}

function isProjectToken(token) {
  return typeof token === 'string' && token.startsWith('vzt_');
}

async function getReviewToken(config, getAccessToken) {
  if (config.userToken) {
    return config.userToken;
  }

  let userToken = await getAccessToken();
  if (userToken) {
    return userToken;
  }

  if (config.apiKey && !isProjectToken(config.apiKey)) {
    return config.apiKey;
  }

  return null;
}

function createReviewClient({ createApiClient, config, command, token }) {
  return createApiClient({
    baseUrl: config.apiUrl,
    token,
    command,
  });
}

function jsonBody(body) {
  if (!body || Object.keys(body).length === 0) {
    return {};
  }

  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  };
}

async function runReviewMutation({
  command,
  endpoint,
  failureMessage,
  globalOptions,
  options,
  requestBody,
  spinnerMessage,
  writeJsonError,
  writeJsonSuccess,
  writeHumanSuccess,
  deps,
  configure = true,
}) {
  let { loadConfig, createApiClient, getAccessToken, output, exit } =
    createReviewDeps(deps);

  if (configure) {
    configureOutput(output, globalOptions);
  }

  try {
    let config = await loadReviewConfig({ loadConfig, options, globalOptions });
    let token = await getReviewToken(config, getAccessToken);

    if (!token) {
      output.error('User login required for review actions');
      output.hint('Run "vizzly login" to approve, reject, or comment');
      output.cleanup();
      exit(1);
      return;
    }

    output.startSpinner(spinnerMessage);

    let client = createReviewClient({
      createApiClient,
      config,
      command,
      token,
    });
    let response = await client.request(endpoint, {
      method: 'POST',
      ...jsonBody(requestBody),
    });

    output.stopSpinner();

    if (globalOptions.json) {
      writeJsonSuccess(output, response);
      output.cleanup();
      return;
    }

    writeHumanSuccess(output, response);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    if (globalOptions.json) {
      writeJsonError(output, error);
      output.cleanup();
      exit(1);
      return;
    }

    output.error(failureMessage, error);
    output.cleanup();
    exit(1);
  }
}

export function createApprovalBody(options = {}) {
  return options.comment ? { comment: options.comment } : {};
}

export function createRejectionBody(options = {}) {
  return { reason: options.reason };
}

export function createCommentBody(message, options = {}) {
  return {
    content: message,
    type: options.type || 'general',
  };
}

/**
 * Approve a comparison
 * @param {string} comparisonId - Comparison ID to approve
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function approveCommand(
  comparisonId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  return await runReviewMutation({
    command: 'approve',
    endpoint: `/api/sdk/comparisons/${comparisonId}/approve`,
    failureMessage: 'Failed to approve comparison',
    globalOptions,
    options,
    requestBody: createApprovalBody(options),
    spinnerMessage: 'Approving comparison...',
    writeJsonError: (output, error) =>
      output.data({
        approved: false,
        comparisonId,
        error: { message: error.message, code: error.code },
      }),
    writeJsonSuccess: (output, response) =>
      output.data({
        approved: true,
        comparisonId,
        comparison: response.comparison,
      }),
    writeHumanSuccess: output => {
      output.complete(`Comparison ${comparisonId} approved`);
      if (options.comment) {
        output.hint(`Comment: "${options.comment}"`);
      }
    },
    deps,
  });
}

/**
 * Reject a comparison
 * @param {string} comparisonId - Comparison ID to reject
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function rejectCommand(
  comparisonId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output, exit } = createReviewDeps(deps);
  configureOutput(output, globalOptions);

  if (!options.reason) {
    output.error('Reason required when rejecting');
    output.hint('Use --reason "explanation" to provide a reason');
    output.cleanup();
    exit(1);
    return;
  }

  return await runReviewMutation({
    command: 'reject',
    endpoint: `/api/sdk/comparisons/${comparisonId}/reject`,
    failureMessage: 'Failed to reject comparison',
    globalOptions,
    options,
    requestBody: createRejectionBody(options),
    spinnerMessage: 'Rejecting comparison...',
    writeJsonError: (output, error) =>
      output.data({
        rejected: false,
        comparisonId,
        error: { message: error.message, code: error.code },
      }),
    writeJsonSuccess: (output, response) =>
      output.data({
        rejected: true,
        comparisonId,
        reason: options.reason,
        comparison: response.comparison,
      }),
    writeHumanSuccess: output => {
      output.complete(`Comparison ${comparisonId} rejected`);
      output.hint(`Reason: "${options.reason}"`);
    },
    deps,
    configure: false,
  });
}

/**
 * Add a comment to a build
 * @param {string} buildId - Build ID to comment on
 * @param {string} message - Comment message
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function commentCommand(
  buildId,
  message,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output, exit } = createReviewDeps(deps);
  configureOutput(output, globalOptions);

  if (!message || message.trim() === '') {
    output.error('Comment message required');
    output.cleanup();
    exit(1);
    return;
  }

  return await runReviewMutation({
    command: 'comment',
    endpoint: `/api/sdk/builds/${buildId}/comments`,
    failureMessage: 'Failed to add comment',
    globalOptions,
    options,
    requestBody: createCommentBody(message, options),
    spinnerMessage: 'Adding comment...',
    writeJsonError: (output, error) =>
      output.data({
        created: false,
        buildId,
        error: { message: error.message, code: error.code },
      }),
    writeJsonSuccess: (output, response) =>
      output.data({
        created: true,
        buildId,
        comment: response.comment,
      }),
    writeHumanSuccess: output => {
      output.complete('Comment added');
      output.labelValue('Build', buildId);
      output.labelValue('Message', message);
    },
    deps,
    configure: false,
  });
}

/**
 * Validate approve command options
 * @param {string} comparisonId - Comparison ID
 * @param {Object} options - Command options
 * @returns {string[]} Array of error messages
 */
export function validateApproveOptions(comparisonId, _options = {}) {
  let errors = [];
  if (!comparisonId || comparisonId.trim() === '') {
    errors.push('Comparison ID is required');
  }
  return errors;
}

/**
 * Validate reject command options
 * @param {string} comparisonId - Comparison ID
 * @param {Object} options - Command options
 * @returns {string[]} Array of error messages
 */
export function validateRejectOptions(comparisonId, options = {}) {
  let errors = [];
  if (!comparisonId || comparisonId.trim() === '') {
    errors.push('Comparison ID is required');
  }
  if (!options.reason || options.reason.trim() === '') {
    errors.push('--reason is required when rejecting');
  }
  return errors;
}

/**
 * Validate comment command options
 * @param {string} buildId - Build ID
 * @param {string} message - Comment message
 * @param {Object} options - Command options
 * @returns {string[]} Array of error messages
 */
export function validateCommentOptions(buildId, message, options = {}) {
  let errors = [];
  if (!buildId || buildId.trim() === '') {
    errors.push('Build ID is required');
  }
  if (!message || message.trim() === '') {
    errors.push('Comment message is required');
  }
  if (
    options.type &&
    !['general', 'approval', 'rejection'].includes(options.type)
  ) {
    errors.push('--type must be one of: general, approval, rejection');
  }
  return errors;
}
