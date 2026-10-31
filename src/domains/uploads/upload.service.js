import { readFile, stat } from 'node:fs/promises';
import { glob } from 'glob';
import {
  TimeoutError,
  UploadError,
  ValidationError,
} from '../../errors/vizzly-error.js';
import { getDefaultBranch } from '../../services/git.js';
import * as output from '../../services/output.js';
import { createApiClient } from '../auth/cloud-client.js';
import { createBuild } from '../builds/build.service.js';
import { checkShas } from '../screenshots/cloud-screenshots.js';
import {
  buildFileMetadata,
  extractStatusCodeFromError,
  fileToScreenshotFormat,
} from './upload.normalizers.js';
import {
  buildBuildInfo,
  buildCompletedProgress,
  buildDeduplicationProgress,
  buildProcessingProgress,
  buildScanningProgress,
  buildUploadingProgress,
  buildUploadResult,
  buildWaitResult,
} from './upload.serializers.js';
import {
  validateApiKey,
  validateDirectoryStats,
  validateFilesFound,
  validateScreenshotsDir,
} from './upload.validations.js';
import {
  DEFAULT_BUILD_POLL_INTERVAL,
  DEFAULT_SHA_CHECK_BATCH_SIZE,
} from './upload-defaults.js';
import {
  buildScreenshotPattern,
  partitionFilesByExistence,
} from './upload-files.js';
import { resolveBatchSize, resolveTimeout } from './upload-settings.js';
import { getElapsedTime, isTimedOut } from './upload-timing.js';

/**
 * Screenshot upload operations and the public uploader factory.
 * Dependencies are explicit so callers can choose external integrations.
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

  async function uploadScreenshots(uploadOptions) {
    return upload({
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

  async function waitForUploadedBuild(buildId, waitTimeout = timeout) {
    return waitForBuild({
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

  return { upload: uploadScreenshots, waitForBuild: waitForUploadedBuild };
}
function delay(ms, signal) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeoutId;

    function cleanup() {
      clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', handleAbort);
    }

    function handleAbort() {
      cleanup();
      reject(new Error('Operation cancelled'));
    }

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener?.('abort', handleAbort, { once: true });
  });
}

/**
 * Find all PNG screenshots in a directory
 * @param {Object} options - Options
 * @param {string} options.directory - Directory to search
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.glob - Glob function
 * @returns {Promise<Array<string>>} Array of file paths
 */
export async function findScreenshots({ directory, deps }) {
  let { glob } = deps;
  let pattern = buildScreenshotPattern(directory);
  return glob(pattern, { absolute: true });
}

/**
 * Process files to extract metadata and compute hashes
 * @param {Object} options - Options
 * @param {Array<string>} options.files - File paths
 * @param {AbortSignal} options.signal - Abort signal
 * @param {Function} options.onProgress - Progress callback
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.readFile - File read function
 * @param {Function} options.deps.createError - Error factory
 * @returns {Promise<Array>} File metadata array
 */
export async function processFiles({ files, signal, onProgress, deps }) {
  let { readFile, createError } = deps;
  let results = [];
  let count = 0;

  for (let filePath of files) {
    if (signal.aborted) {
      throw createError('Operation cancelled', 'UPLOAD_CANCELLED');
    }

    let buffer = await readFile(filePath);
    let metadata = buildFileMetadata(filePath, buffer);
    results.push(metadata);
    count++;

    if (count % 10 === 0 || count === files.length) {
      onProgress(count);
    }
  }

  return results;
}

/**
 * Check which files already exist on the server
 * @param {Object} options - Options
 * @param {Array} options.fileMetadata - File metadata array
 * @param {Object} options.client - API client
 * @param {AbortSignal} options.signal - Abort signal
 * @param {string} options.buildId - Build ID
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.checkShas - SHA check API function
 * @param {Function} options.deps.createError - Error factory
 * @param {Object} options.deps.output - Output utilities
 * @returns {Promise<{ toUpload: Array, existing: Array, screenshots: Array }>}
 */
export async function checkExistingFiles({
  fileMetadata,
  client,
  signal,
  buildId,
  deps,
}) {
  let { checkShas, createError, output } = deps;
  let existingShas = new Set();
  let allScreenshots = [];

  for (let i = 0; i < fileMetadata.length; i += DEFAULT_SHA_CHECK_BATCH_SIZE) {
    if (signal.aborted) {
      throw createError('Operation cancelled', 'UPLOAD_CANCELLED');
    }

    let batch = fileMetadata.slice(i, i + DEFAULT_SHA_CHECK_BATCH_SIZE);
    let screenshotBatch = batch.map(fileToScreenshotFormat);

    try {
      let res = await checkShas(client, screenshotBatch, buildId);
      let { existing = [], screenshots = [] } = res || {};

      for (let sha of existing) {
        existingShas.add(sha);
      }
      allScreenshots.push(...screenshots);
    } catch (error) {
      output.debug(
        'upload',
        'SHA check failed, continuing without deduplication',
        { error: error.message }
      );
    }
  }

  let partitioned = partitionFilesByExistence(fileMetadata, existingShas);

  return {
    toUpload: partitioned.toUpload,
    existing: partitioned.existing,
    screenshots: allScreenshots,
  };
}

/**
 * Upload files to Vizzly
 * @param {Object} options - Options
 * @param {Array} options.toUpload - Files to upload
 * @param {string} options.buildId - Build ID
 * @param {Object} options.client - API client
 * @param {AbortSignal} options.signal - Abort signal
 * @param {number} options.batchSize - Batch size
 * @param {Function} options.onProgress - Progress callback
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createError - Error factory
 * @returns {Promise<{ buildId: string, url: string|null }>}
 */
export async function uploadFiles({
  toUpload,
  buildId,
  client,
  signal,
  batchSize,
  onProgress,
  deps,
}) {
  let { createError } = deps;
  let result = null;

  if (toUpload.length === 0) {
    return { buildId, url: null };
  }

  for (let i = 0; i < toUpload.length; i += batchSize) {
    if (signal.aborted) {
      throw createError('Operation cancelled', 'UPLOAD_CANCELLED');
    }

    let batch = toUpload.slice(i, i + batchSize);
    let form = new FormData();

    form.append('build_id', buildId);

    for (let file of batch) {
      let blob = new Blob([file.buffer], { type: 'image/png' });
      form.append('screenshots', blob, file.filename);
    }

    try {
      result = await client.request('/api/sdk/upload', {
        method: 'POST',
        body: form,
        signal,
        headers: {},
      });
    } catch (err) {
      throw createError(`Upload failed: ${err.message}`, 'UPLOAD_FAILED', {
        batch: Math.floor(i / batchSize) + 1,
      });
    }

    onProgress(i + batch.length);
  }

  return {
    buildId,
    url: result?.build?.url || result?.url,
  };
}

/**
 * Wait for a build to complete
 * @param {Object} options - Options
 * @param {string} options.buildId - Build ID
 * @param {number} options.timeout - Timeout in ms
 * @param {AbortSignal} options.signal - Abort signal
 * @param {Object} options.client - API client
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createError - Error factory
 * @param {Function} options.deps.createTimeoutError - Timeout error factory
 * @returns {Promise<Object>} Build result
 */
export async function waitForBuild({ buildId, timeout, signal, client, deps }) {
  let {
    createError,
    createTimeoutError,
    now = () => Date.now(),
    pollInterval = DEFAULT_BUILD_POLL_INTERVAL,
    wait = delay,
  } = deps;
  let startTime = now();

  while (!isTimedOut(startTime, timeout, now())) {
    if (signal.aborted) {
      throw createError('Operation cancelled', 'UPLOAD_CANCELLED', { buildId });
    }

    let resp;
    try {
      resp = await client.request(`/api/sdk/builds/${buildId}`, { signal });
    } catch (err) {
      let code = extractStatusCodeFromError(err?.message);
      throw createError(
        `Failed to check build status: ${code}`,
        'BUILD_STATUS_FAILED'
      );
    }

    let build = resp?.build ?? resp;

    if (build.status === 'completed') {
      return buildWaitResult(build);
    }

    if (build.status === 'failed') {
      throw createError(
        `Build failed: ${build.error || 'Unknown error'}`,
        'BUILD_FAILED',
        { buildId, build }
      );
    }

    let remaining = timeout - getElapsedTime(startTime, now());
    if (remaining <= 0) {
      break;
    }

    await wait(Math.min(pollInterval, remaining), signal);
  }

  throw createTimeoutError(`Build timed out after ${timeout}ms`, {
    buildId,
    timeout,
    elapsed: getElapsedTime(startTime, now()),
  });
}

/**
 * Upload screenshots to Vizzly
 * @param {Object} options - Options
 * @param {Object} options.uploadOptions - Upload options (screenshotsDir, buildName, etc.)
 * @param {Object} options.config - Configuration
 * @param {AbortSignal} options.signal - Abort signal
 * @param {number} options.batchSize - Batch size
 * @param {Object} options.deps - Dependencies
 * @returns {Promise<Object>} Upload result
 */
export async function upload({
  uploadOptions,
  config,
  signal,
  batchSize,
  deps,
}) {
  let {
    client,
    createBuild,
    getDefaultBranch,
    glob,
    readFile,
    stat,
    checkShas,
    createError,
    createValidationError,
    createUploadError,
    output,
  } = deps;

  let { screenshotsDir, onProgress = () => {} } = uploadOptions;

  try {
    // Validate API key
    let apiKeyValidation = validateApiKey(config.apiKey);
    if (!apiKeyValidation.valid) {
      throw createValidationError(apiKeyValidation.error, {
        config: { apiKey: config.apiKey, apiUrl: config.apiUrl },
      });
    }

    // Validate screenshots directory
    let dirValidation = validateScreenshotsDir(screenshotsDir);
    if (!dirValidation.valid) {
      throw createValidationError(dirValidation.error);
    }

    let stats = await stat(screenshotsDir);
    let statsValidation = validateDirectoryStats(stats, screenshotsDir);
    if (!statsValidation.valid) {
      throw createValidationError(statsValidation.error);
    }

    // Find screenshots
    let files = await findScreenshots({
      directory: screenshotsDir,
      deps: { glob },
    });
    let filesValidation = validateFilesFound(files, screenshotsDir);
    if (!filesValidation.valid) {
      throw createUploadError(filesValidation.error, filesValidation.context);
    }

    onProgress(buildScanningProgress(files.length));

    // Process files
    let fileMetadata = await processFiles({
      files,
      signal,
      onProgress: current =>
        onProgress(buildProcessingProgress(current, files.length)),
      deps: { readFile, createError },
    });

    // Create build
    let defaultBranch = await getDefaultBranch();
    let buildInfo = buildBuildInfo(uploadOptions, defaultBranch);
    let build = await createBuild(client, buildInfo);
    let buildId = build.id;

    let toUpload = fileMetadata;
    let existing = [];
    let screenshots = [];

    if (!uploadOptions.uploadAll) {
      let existingResult = await checkExistingFiles({
        fileMetadata,
        client,
        signal,
        buildId,
        deps: { checkShas, createError, output },
      });
      toUpload = existingResult.toUpload;
      existing = existingResult.existing;
      screenshots = existingResult.screenshots;
    }

    onProgress(
      buildDeduplicationProgress(toUpload.length, existing.length, files.length)
    );

    // Upload files
    let result = await uploadFiles({
      toUpload,
      existing,
      screenshots,
      buildId,
      buildInfo,
      client,
      signal,
      batchSize,
      onProgress: current =>
        onProgress(buildUploadingProgress(current, toUpload.length)),
      deps: { createError },
    });

    onProgress(buildCompletedProgress(result.buildId, result.url));

    return buildUploadResult({
      buildId: result.buildId,
      url: result.url,
      total: files.length,
      uploaded: toUpload.length,
      skipped: existing.length,
    });
  } catch (error) {
    output.debug('upload', 'failed', { error: error.message });

    // Re-throw if already a VizzlyError
    if (error.name?.includes('Error') && error.code) {
      throw error;
    }

    // Wrap unknown errors
    throw createUploadError(`Upload failed: ${error.message}`, {
      originalError: error.message,
      stack: error.stack,
    });
  }
}
