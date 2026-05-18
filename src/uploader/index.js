/**
 * Uploader Module
 *
 * Exports pure functions (core), I/O operations, and the public uploader
 * factory for screenshot uploading.
 */

import { readFile, stat } from 'node:fs/promises';
import { glob } from 'glob';
import { checkShas, createApiClient, createBuild } from '../api/index.js';
import {
  TimeoutError,
  UploadError,
  ValidationError,
} from '../errors/vizzly-error.js';
import { getDefaultBranch } from '../utils/git.js';
import * as output from '../utils/output.js';
import { resolveBatchSize, resolveTimeout } from './core.js';
import {
  upload as uploadOperation,
  waitForBuild as waitForBuildOperation,
} from './operations.js';

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

  let batchSize = resolveBatchSize(options, uploadConfig);
  let timeout = resolveTimeout(options, uploadConfig);
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

// Core - pure functions
export {
  buildBuildInfo,
  buildCompletedProgress,
  buildDeduplicationProgress,
  buildFileMetadata,
  buildProcessingProgress,
  buildScanningProgress,
  buildScreenshotPattern,
  buildUploadingProgress,
  buildUploadResult,
  buildWaitResult,
  computeSha256,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BUILD_POLL_INTERVAL,
  DEFAULT_SHA_CHECK_BATCH_SIZE,
  DEFAULT_TIMEOUT,
  extractBrowserFromFilename,
  extractStatusCodeFromError,
  fileToScreenshotFormat,
  getElapsedTime,
  isTimedOut,
  partitionFilesByExistence,
  resolveBatchSize,
  resolveTimeout,
  validateApiKey,
  validateDirectoryStats,
  validateFilesFound,
  validateScreenshotsDir,
} from './core.js';

// Operations - I/O with dependency injection
export {
  checkExistingFiles,
  findScreenshots,
  processFiles,
  upload,
  uploadFiles,
  waitForBuild,
} from './operations.js';
