/**
 * API command - raw API access for power users
 */

import { createApiClient as defaultCreateApiClient } from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

let ALLOWED_POST_ENDPOINTS = [
  /^\/api\/sdk\/comparisons\/[^/]+\/approve$/,
  /^\/api\/sdk\/comparisons\/[^/]+\/reject$/,
  /^\/api\/sdk\/builds\/[^/]+\/comments$/,
];

function createApiCommandDeps(deps = {}) {
  return {
    loadConfig: deps.loadConfig || defaultLoadConfig,
    createApiClient: deps.createApiClient || defaultCreateApiClient,
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

export function normalizeApiEndpoint(endpoint) {
  let normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (!normalizedEndpoint.startsWith('/api/')) {
    normalizedEndpoint = `/api${normalizedEndpoint}`;
  }

  return normalizedEndpoint;
}

export function normalizeApiMethod(method = 'GET') {
  return method.toUpperCase();
}

export function isAllowedPostEndpoint(endpoint) {
  return ALLOWED_POST_ENDPOINTS.some(pattern => pattern.test(endpoint));
}

export function parseApiHeaders(headerOption) {
  let headers = {};
  let headerList = Array.isArray(headerOption) ? headerOption : [headerOption];

  for (let header of headerList.filter(Boolean)) {
    let [key, ...valueParts] = header.split(':');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join(':').trim();
    }
  }

  return headers;
}

export function appendApiQuery(endpoint, queryOption) {
  if (!queryOption) {
    return endpoint;
  }

  let params = new URLSearchParams();
  let queryList = Array.isArray(queryOption) ? queryOption : [queryOption];

  for (let query of queryList) {
    let [key, ...valueParts] = query.split('=');
    if (key && valueParts.length > 0) {
      params.append(key.trim(), valueParts.join('=').trim());
    }
  }

  let queryString = params.toString();
  if (!queryString) {
    return endpoint;
  }

  return endpoint + (endpoint.includes('?') ? '&' : '?') + queryString;
}

export function validateApiRequest({ endpoint, method, hasData = false }) {
  let errors = [];

  if (method !== 'GET' && method !== 'POST') {
    errors.push(
      `Method ${method} not allowed. Use GET for queries or POST for approve/reject/comment.`
    );
    return errors;
  }

  if (method === 'POST' && !isAllowedPostEndpoint(endpoint)) {
    errors.push(
      `POST not allowed for ${endpoint}. Only approve, reject, and comment endpoints support POST.`
    );
  }

  if (hasData && method !== 'POST') {
    errors.push('Request data requires --method POST.');
  }

  return errors;
}

export function buildApiRequest({ endpoint, options = {} }) {
  let normalizedEndpoint = normalizeApiEndpoint(endpoint);
  let method = normalizeApiMethod(options.method || 'GET');
  let errors = validateApiRequest({
    endpoint: normalizedEndpoint,
    method,
    hasData: options.data !== undefined,
  });

  if (errors.length > 0) {
    return { errors, method, normalizedEndpoint, requestOptions: null };
  }

  let headers = parseApiHeaders(options.header);
  let requestOptions = { method };

  if (options.data && method === 'POST') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    requestOptions.body = options.data;
  }

  if (Object.keys(headers).length > 0) {
    requestOptions.headers = headers;
  }

  return {
    errors: [],
    method,
    normalizedEndpoint: appendApiQuery(normalizedEndpoint, options.query),
    requestOptions,
  };
}

/**
 * API command - make raw API requests
 * @param {string} endpoint - API endpoint (e.g., /sdk/builds)
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function apiCommand(
  endpoint,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { loadConfig, createApiClient, output, exit } =
    createApiCommandDeps(deps);
  let displayEndpoint = normalizeApiEndpoint(endpoint);
  let displayMethod = normalizeApiMethod(options.method || 'GET');

  configureOutput(output, globalOptions);

  try {
    // Load configuration
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      output.cleanup();
      exit(1);
      return;
    }

    let { errors, method, normalizedEndpoint, requestOptions } =
      buildApiRequest({ endpoint, options });

    displayEndpoint = normalizedEndpoint;
    displayMethod = method;

    if (errors.length > 0) {
      output.error(errors[0]);
      if (method === 'POST') {
        output.hint(
          'Use GET for queries, or use dedicated commands (vizzly approve, vizzly reject, vizzly comment)'
        );
      }
      output.hint(
        'Most raw API use should stay read-only; prefer dedicated commands for mutations.'
      );
      output.cleanup();
      exit(1);
      return;
    }

    // Make the request
    output.startSpinner(`${method} ${normalizedEndpoint}`);

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'api',
    });

    let response = await client.request(normalizedEndpoint, requestOptions);
    output.stopSpinner();

    // Output response
    if (globalOptions.json) {
      output.data({
        endpoint: normalizedEndpoint,
        method,
        response,
      });
      output.cleanup();
      return;
    }

    // Pretty print response for humans
    output.header('api');
    output.labelValue('Endpoint', normalizedEndpoint);
    output.labelValue('Method', method);
    output.blank();

    // Format response
    if (typeof response === 'object') {
      output.print(JSON.stringify(response, null, 2));
    } else {
      output.print(String(response));
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    if (globalOptions.json) {
      output.data({
        endpoint: displayEndpoint,
        method: displayMethod,
        error: {
          message: error.message,
          code: error.code,
          status: error.context?.status,
        },
      });
      output.cleanup();
      exit(1);
      return;
    }

    output.error('API request failed', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Validate API command options
 */
export function validateApiOptions(endpoint, options = {}) {
  let errors = [];

  if (!endpoint || endpoint.trim() === '') {
    errors.push('Endpoint is required');
  }

  if (!endpoint || endpoint.trim() === '') {
    return errors;
  }

  let normalizedEndpoint = normalizeApiEndpoint(endpoint);
  let method = normalizeApiMethod(options.method || 'GET');
  errors.push(
    ...validateApiRequest({
      endpoint: normalizedEndpoint,
      method,
      hasData: options.data !== undefined,
    })
  );

  return errors;
}
