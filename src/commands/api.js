/**
 * API command - raw API access for power users
 */

import { createWriteStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createApiClient as defaultCreateApiClient } from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

let API_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

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
  if (!API_METHODS.includes(method)) {
    errors.push(`Unsupported HTTP method: ${method}`);
  }
  if (hasData && ['GET', 'HEAD'].includes(method)) {
    errors.push('Request data requires a method other than GET or HEAD.');
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(endpoint) || endpoint.startsWith('//')) {
    errors.push('Use an API path on the configured Vizzly server.');
  }
  return errors;
}

export function buildApiRequest({ endpoint, options = {} }) {
  let normalizedEndpoint = normalizeApiEndpoint(endpoint);
  let method = normalizeApiMethod(options.method || 'GET');
  let errors = validateApiRequest({
    endpoint,
    method,
    hasData: options.data !== undefined,
  });

  if (errors.length > 0) {
    return { errors, method, normalizedEndpoint, requestOptions: null };
  }

  let headers = parseApiHeaders(options.header);
  let requestOptions = { method };

  if (options.data !== undefined && !['GET', 'HEAD'].includes(method)) {
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

    // A linked project's upload credential must not hide an existing user login.
    // Explicit file/env/--token credentials still take precedence.
    let token = config.linkedProject
      ? config.userToken || config.apiKey
      : config.apiKey || config.userToken;
    if (!token && !options.schemaDiscovery) {
      output.error(
        'Authentication required. Run vizzly login or set VIZZLY_TOKEN.'
      );
      output.cleanup();
      exit(1);
      return;
    }

    if (options.data?.startsWith('@')) {
      let source = options.data.slice(1);
      let data =
        source === '-' ? await readStdin() : await readFile(source, 'utf8');
      options = { ...options, data };
    }
    if (options.data !== undefined) JSON.parse(options.data);

    let { errors, method, normalizedEndpoint, requestOptions } =
      buildApiRequest({ endpoint, options });

    displayEndpoint = normalizedEndpoint;
    displayMethod = method;

    if (errors.length > 0) {
      output.error(errors[0]);
      output.hint('Use vizzly api schema to discover supported operations.');
      output.cleanup();
      exit(1);
      return;
    }

    // Make the request
    output.startSpinner(`${method} ${normalizedEndpoint}`);

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token,
      command: 'api',
      allowNoToken: Boolean(options.schemaDiscovery),
    });

    let response = await client.request(normalizedEndpoint, {
      ...requestOptions,
      redirect: 'error',
      retryAuthentication: ['GET', 'HEAD'].includes(method),
      responseType: options.output ? 'response' : 'json',
    });
    if (options.output) {
      let path = resolve(options.output);
      let file = createWriteStream(path, { flags: 'wx' });
      let created = false;
      file.once('open', () => {
        created = true;
      });
      try {
        await pipeline(response.body || Readable.from([]), file);
      } catch (error) {
        if (created) await unlink(path);
        throw error;
      }
      response = {
        file: path,
        contentType: response.headers.get('content-type'),
      };
    }
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

  let method = normalizeApiMethod(options.method || 'GET');
  errors.push(
    ...validateApiRequest({
      endpoint,
      method,
      hasData: options.data !== undefined,
    })
  );

  return errors;
}

async function readStdin() {
  let chunks = [];
  for await (let chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString(
    'utf8'
  );
}

export async function apiSchemaCommand(operationId, options, globalOptions) {
  let endpoint = '/api/sdk/schema';
  if (operationId) {
    endpoint += `/${encodeURIComponent(operationId)}`;
    if (options.full)
      options = { ...options, query: [...(options.query || []), 'view=full'] };
  } else if (options.full) endpoint += '/openapi';
  return apiCommand(
    endpoint,
    { ...options, schemaDiscovery: true },
    globalOptions
  );
}
