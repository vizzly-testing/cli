/**
 * Vizzly Screenshot Uploader
 * Handles screenshot uploads to the Vizzly platform
 *
 * This module is a thin wrapper around the functional operations in
 * src/uploader/. It maintains backwards compatibility while
 * delegating to pure functions for testability.
 */

import { readFile, stat } from 'node:fs/promises';
import { glob } from 'glob';
import { checkShas, createApiClient, createBuild } from '../api/index.js';
import {
  TimeoutError,
  UploadError,
  ValidationError,
} from '../errors/vizzly-error.js';
import { resolveBatchSize, resolveTimeout } from '../uploader/index.js';
import {
  upload as uploadOperation,
  waitForBuild as waitForBuildOperation,
} from '../uploader/operations.js';
import { getDefaultBranch } from '../utils/git.js';
import * as output from '../utils/output.js';

/**
 * Create a new uploader instance
 */
export function createUploader(
  { apiKey, apiUrl, userAgent, command, upload: uploadConfig = {} } = {},
  options = {}
) {
  let signal = options.signal || new AbortController().signal;
  let client = createApiClient({
    baseUrl: apiUrl,
    token: apiKey,
    command: command || 'upload',
    sdkUserAgent: userAgent,
    allowNoToken: true,
  });

  // Resolve tunable parameters
  let batchSize = resolveBatchSize(options, uploadConfig);
  let timeout = resolveTimeout(options, uploadConfig);

  // Dependency injection for testing
  let deps = options.deps || {
    client,
    createBuild,
    getDefaultBranch,
    glob,
    readFile,
    stat,
    checkShas,
    createError: (message, code, context) => {
      let error = new UploadError(message, context);
      error.code = code;
      return error;
    },
    createValidationError: (message, context) =>
      new ValidationError(message, context),
    createUploadError: (message, context) => new UploadError(message, context),
    createTimeoutError: (message, context) =>
      new TimeoutError(message, context),
    output,
  };

  /**
   * Upload screenshots to Vizzly
   */
  async function upload(uploadOptions) {
    return uploadOperation({
      uploadOptions,
      config: { apiKey, apiUrl },
      signal,
      batchSize,
      deps: {
        ...deps,
        client: deps.client || client,
      },
    });
  }

  /**
   * Wait for a build to complete
   */
  async function waitForBuild(buildId, waitTimeout = timeout) {
    return waitForBuildOperation({
      buildId,
      timeout: waitTimeout,
      signal,
      client: deps.client || client,
      deps: {
        createError: deps.createError,
        createTimeoutError: deps.createTimeoutError,
      },
    });
  }

  return { upload, waitForBuild };
}
