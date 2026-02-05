/**
 * API command - raw API access for power users
 */

import { createApiClient as defaultCreateApiClient } from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

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
    // Load configuration
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      exit(1);
      return;
    }

    // Normalize endpoint
    let normalizedEndpoint = endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
    if (!normalizedEndpoint.startsWith('/api/')) {
      normalizedEndpoint = `/api${normalizedEndpoint}`;
    }

    // Build request options
    let method = (options.method || 'GET').toUpperCase();

    // Validate method and endpoint combination
    if (method === 'POST' && !isAllowedPostEndpoint(normalizedEndpoint)) {
      output.error(
        `POST not allowed for ${normalizedEndpoint}. Only approve, reject, and comment endpoints support POST.`
      );
      output.hint(
        'Use GET for queries, or use dedicated commands (vizzly approve, vizzly reject, vizzly comment)'
      );
      exit(1);
      return;
    }

    if (method !== 'GET' && method !== 'POST') {
      output.error(`Method ${method} not allowed. Use GET for queries.`);
      exit(1);
      return;
    }

    let requestOptions = { method };

    // Add headers
    let headers = {};
    if (options.header) {
      let headerList = Array.isArray(options.header)
        ? options.header
        : [options.header];
      for (let h of headerList) {
        let [key, ...valueParts] = h.split(':');
        if (key && valueParts.length > 0) {
          headers[key.trim()] = valueParts.join(':').trim();
        }
      }
    }

    // Add body for POST/PUT/PATCH
    if (options.data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      requestOptions.body = options.data;
    }

    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers;
    }

    // Add query parameters
    if (options.query) {
      let params = new URLSearchParams();
      let queryList = Array.isArray(options.query)
        ? options.query
        : [options.query];
      for (let q of queryList) {
        let [key, ...valueParts] = q.split('=');
        if (key && valueParts.length > 0) {
          params.append(key.trim(), valueParts.join('=').trim());
        }
      }
      let queryString = params.toString();
      if (queryString) {
        normalizedEndpoint +=
          (normalizedEndpoint.includes('?') ? '&' : '?') + queryString;
      }
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
        endpoint,
        method: options.method || 'GET',
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
 * Allowed POST endpoints (whitelist for mutations)
 * Most mutations should use dedicated commands, but these are allowed for raw API access
 */
const ALLOWED_POST_ENDPOINTS = [
  /^\/api\/sdk\/comparisons\/[^/]+\/approve$/,
  /^\/api\/sdk\/comparisons\/[^/]+\/reject$/,
  /^\/api\/sdk\/builds\/[^/]+\/comments$/,
];

/**
 * Check if a POST endpoint is allowed
 */
function isAllowedPostEndpoint(endpoint) {
  return ALLOWED_POST_ENDPOINTS.some(pattern => pattern.test(endpoint));
}

/**
 * Validate API command options
 */
export function validateApiOptions(endpoint, options = {}) {
  let errors = [];

  if (!endpoint || endpoint.trim() === '') {
    errors.push('Endpoint is required');
  }

  let method = (options.method || 'GET').toUpperCase();

  // Only GET is allowed by default
  // POST is allowed only for whitelisted endpoints
  if (method !== 'GET' && method !== 'POST') {
    errors.push(
      `Method ${method} not allowed. Use GET for queries or POST for approve/reject/comment.`
    );
  }

  return errors;
}
