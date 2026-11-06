/**
 * Review commands - approve, reject, and comment on comparisons/builds
 */

import { randomUUID as defaultRandomUUID } from 'node:crypto';
import * as defaultOutput from '../../shared/output.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { requireCredentialScope } from '../auth/credential.rules.js';
import { resolveCredential } from '../auth/credential.service.js';
import { showCredential } from '../auth/credential-presentation.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';

function createReviewDeps(deps = {}) {
  return {
    loadConfig: deps.loadConfig || defaultLoadConfig,
    createApiClient: deps.createApiClient || defaultCreateApiClient,
    randomUUID: deps.randomUUID || defaultRandomUUID,
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

function createReviewClient({
  createApiClient,
  config,
  command,
  globalOptions,
  options,
  output,
}) {
  let credential = resolveCredential(config, {
    ...globalOptions,
    ...options,
    command,
  });
  if (credential.kind === 'project') {
    throw new VizzlyError(
      'User login required for review actions. VIZZLY_TOKEN and --token take precedence; omit a project token to use vizzly login.',
      'USER_AUTH_REQUIRED'
    );
  }
  requireCredentialScope(
    credential,
    command === 'comment' ? 'comments:write' : 'reviews:write'
  );
  if (!globalOptions.json) showCredential(output, credential);
  return createApiClient({
    baseUrl: config.apiUrl,
    token: credential.token,
    credential,
    command,
    attribution: globalOptions,
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
  let { loadConfig, createApiClient, output, exit } = createReviewDeps(deps);

  if (configure) {
    configureOutput(output, globalOptions);
  }

  try {
    let config = await loadReviewConfig({ loadConfig, options, globalOptions });
    let client = createReviewClient({
      createApiClient,
      config,
      command,
      globalOptions,
      options,
      output,
    });
    output.startSpinner(spinnerMessage);
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
  return options.comment ? { annotation: options.comment.trim() } : {};
}

export function createRejectionBody(options = {}) {
  return { annotation: options.reason.trim() };
}

export function createCommentBody(message, options = {}) {
  return {
    content: message,
    ...(options.layer ? { layer: options.layer } : {}),
    ...(options.region ? { region: parseCommentRegion(options.region) } : {}),
    ...(options.point ? parseCommentPoint(options.point) : {}),
    ...(options.replyTo ? { parentCommentId: options.replyTo } : {}),
  };
}

function requireReviewLocator(response) {
  let locator = response?.review_locator;
  if (
    !locator?.comparison_id ||
    !locator?.build_id ||
    !locator?.organization_slug
  ) {
    let error = new Error(
      'Comparison response did not include review location details'
    );
    error.code = 'INVALID_REVIEW_CONTEXT';
    throw error;
  }
  return locator;
}

async function runComparisonDecision({
  command,
  comparisonId,
  decision,
  annotation,
  failureMessage,
  globalOptions,
  options,
  spinnerMessage,
  writeHumanSuccess,
  deps,
  configure = true,
}) {
  let { loadConfig, createApiClient, randomUUID, output, exit } =
    createReviewDeps(deps);

  if (configure) {
    configureOutput(output, globalOptions);
  }

  try {
    let config = await loadReviewConfig({ loadConfig, options, globalOptions });
    let client = createReviewClient({
      createApiClient,
      config,
      command,
      globalOptions,
      options,
      output,
    });
    output.startSpinner(spinnerMessage);
    let comparisonResponse = await client.request(
      `/api/sdk/comparisons/${comparisonId}`
    );
    let locator = requireReviewLocator(comparisonResponse);
    if (locator.comparison_id !== comparisonId) {
      let error = new Error(
        'Comparison response did not match the requested comparison'
      );
      error.code = 'INVALID_REVIEW_CONTEXT';
      throw error;
    }

    let organizationHeaders = {
      'X-Organization': locator.organization_slug,
    };
    let commandId = randomUUID();
    let response = await client.request(
      `/api/visual-review/builds/${locator.build_id}/comparisons/${comparisonId}/decision`,
      {
        method: 'POST',
        // The server deduplicates this decision by the unchanged commandId.
        retryAuthentication: true,
        headers: {
          ...organizationHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandId,
          decision,
          ...(annotation ? { annotation } : {}),
        }),
      }
    );

    output.stopSpinner();
    if (globalOptions.json) {
      output.data({
        eventId: response.eventId,
        idempotent: response.idempotent,
        review: response.review,
      });
      output.cleanup();
      return;
    }

    writeHumanSuccess(output);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    if (globalOptions.json) {
      output.data({
        comparisonId,
        error: { message: error.message, code: error.code },
      });
      output.cleanup();
      exit(1);
      return;
    }

    output.error(failureMessage, error);
    output.cleanup();
    exit(1);
  }
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
  return await runComparisonDecision({
    command: 'approve',
    comparisonId,
    decision: 'approved',
    annotation: createApprovalBody(options).annotation,
    failureMessage: 'Failed to approve comparison',
    globalOptions,
    options,
    spinnerMessage: 'Approving comparison...',
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

  return await runComparisonDecision({
    command: 'reject',
    comparisonId,
    decision: 'rejected',
    annotation: createRejectionBody(options).annotation,
    failureMessage: 'Failed to reject comparison',
    globalOptions,
    options,
    spinnerMessage: 'Rejecting comparison...',
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
    endpoint: `/api/sdk/builds/${buildId}${options.screenshot ? `/screenshots/${options.screenshot}` : ''}/comments`,
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
        ...(options.screenshot
          ? { layer: getCommentLayer(response, options) }
          : {}),
        comment: response.comment,
      }),
    writeHumanSuccess: (output, response) => {
      output.complete('Comment added');
      if (options.screenshot)
        output.labelValue('Screenshot', options.screenshot);
      if (options.screenshot)
        output.labelValue('Layer', getCommentLayer(response, options));
      if (options.region) output.labelValue('Region', options.region);
      if (options.point) {
        let { positionX, positionY } = parseCommentPoint(options.point);
        output.labelValue('Point', `${positionX}%, ${positionY}%`);
      }
      if (response.comment?.attribution?.via)
        output.labelValue('Agent', response.comment.attribution.via.name);
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

let COMMENT_LAYERS = ['current', 'baseline', 'diff'];

function getCommentLayer(response, options) {
  return response.comment?.layer || options.layer || 'current';
}

export function parseCommentRegion(value) {
  let numbers = value.split(',').map(Number);
  if (
    numbers.length !== 4 ||
    value.split(',').some(part => !part.trim()) ||
    numbers.some(number => !Number.isSafeInteger(number)) ||
    numbers[0] < 0 ||
    numbers[1] < 0 ||
    numbers[2] <= 0 ||
    numbers[3] <= 0
  ) {
    throw new Error(
      '--region requires x,y,width,height in bitmap pixels; x/y must be nonnegative and width/height positive integers'
    );
  }
  let [x, y, width, height] = numbers;
  return { x, y, width, height };
}

export function parseCommentPoint(value) {
  let parts = value.split(',');
  let numbers = parts.map(Number);
  if (
    numbers.length !== 2 ||
    parts.some(part => !part.trim()) ||
    numbers.some(
      number => !Number.isSafeInteger(number) || number < 0 || number > 100
    )
  ) {
    throw new Error(
      '--point requires x,y as integer percentages from 0 to 100'
    );
  }
  let [positionX, positionY] = numbers;
  return { positionX, positionY };
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
  if (options.layer && !COMMENT_LAYERS.includes(options.layer))
    errors.push(`--layer must be one of: ${COMMENT_LAYERS.join(', ')}`);
  for (let flag of ['layer', 'region', 'point']) {
    if (!options[flag]) continue;
    if (!options.screenshot) errors.push(`--${flag} requires --screenshot`);
    if (options.replyTo)
      errors.push(`Replies inherit their thread's ${flag}; omit --${flag}`);
  }
  if (options.region && options.point)
    errors.push('Use either --region or --point, not both');
  for (let [flag, parse] of [
    ['region', parseCommentRegion],
    ['point', parseCommentPoint],
  ]) {
    if (!options[flag]) continue;
    try {
      parse(options[flag]);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}
