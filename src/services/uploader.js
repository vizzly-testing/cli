/**
 * Vizzly Screenshot Uploader
 * Handles screenshot uploads to the Vizzly platform
 */

import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import { basename } from 'path';
import crypto from 'crypto';
import { createUploaderLogger } from '../utils/logger-factory.js';
import { ApiService } from './api-service.js';

import { getDefaultBranch } from '../utils/git.js';
import {
  UploadError,
  TimeoutError,
  ValidationError,
} from '../errors/vizzly-error.js';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SHA_CHECK_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Create a new uploader instance
 */
export function createUploader(
  { apiKey, apiUrl, userAgent, command, upload: uploadConfig = {} },
  options = {}
) {
  const logger = options.logger || createUploaderLogger(options);
  const signal = options.signal || new AbortController().signal;
  const api = new ApiService({
    baseUrl: apiUrl,
    token: apiKey,
    command: command || 'upload',
    userAgent,
    allowNoToken: true,
  });

  // Resolve tunable parameters from options or config
  const batchSize = Number(
    options.batchSize ?? uploadConfig?.batchSize ?? DEFAULT_BATCH_SIZE
  );
  const TIMEOUT_MS = Number(
    options.timeout ?? uploadConfig?.timeout ?? DEFAULT_TIMEOUT
  );

  /**
   * Upload screenshots to Vizzly
   */
  async function upload({
    screenshotsDir,
    buildName,
    branch,
    commit,
    message,
    environment = 'production',
    threshold,
    onProgress = () => {},
  }) {
    try {
      // Validate required config
      if (!apiKey) {
        throw new ValidationError('API key is required', {
          config: { apiKey, apiUrl },
        });
      }

      if (!screenshotsDir) {
        throw new ValidationError('Screenshots directory is required');
      }

      const stats = await stat(screenshotsDir);

      if (!stats.isDirectory()) {
        throw new ValidationError(`${screenshotsDir} is not a directory`);
      }

      // Find screenshots
      const files = await findScreenshots(screenshotsDir);
      if (files.length === 0) {
        throw new UploadError('No screenshot files found', {
          directory: screenshotsDir,
          pattern: '**/*.png',
        });
      }

      onProgress({ phase: 'scanning', total: files.length });

      // Process files to get metadata
      const fileMetadata = await processFiles(files, signal, current =>
        onProgress({ phase: 'processing', current, total: files.length })
      );

      // Check which files need uploading
      const { toUpload, existing } = await checkExistingFiles(
        fileMetadata,
        api,
        signal
      );

      onProgress({
        phase: 'deduplication',
        toUpload: toUpload.length,
        existing: existing.length,
        total: files.length,
      });

      // Create build and upload files
      const result = await uploadFiles({
        toUpload,
        existing,
        buildInfo: {
          name: buildName || `Upload ${new Date().toISOString()}`,
          branch: branch || (await getDefaultBranch()) || 'main',
          commitSha: commit,
          commitMessage: message,
          environment,
          threshold,
        },
        api,
        signal,
        batchSize: batchSize,
        onProgress: current =>
          onProgress({
            phase: 'uploading',
            current,
            total: toUpload.length,
          }),
      });

      onProgress({
        phase: 'completed',
        buildId: result.buildId,
        url: result.url,
      });

      return {
        success: true,
        buildId: result.buildId,
        url: result.url,
        stats: {
          total: files.length,
          uploaded: toUpload.length,
          skipped: existing.length,
        },
      };
    } catch (error) {
      logger.error('Upload failed:', error);

      // Re-throw if already a VizzlyError
      if (error.name && error.name.includes('Error') && error.code) {
        throw error;
      }

      // Wrap unknown errors
      throw new UploadError(`Upload failed: ${error.message}`, {
        originalError: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Wait for a build to complete
   */
  async function waitForBuild(buildId, timeout = TIMEOUT_MS) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (signal.aborted) {
        throw new UploadError('Operation cancelled', { buildId });
      }

      let resp;
      try {
        resp = await api.request(`/api/sdk/builds/${buildId}`, { signal });
      } catch (err) {
        const match = String(err?.message || '').match(
          /API request failed: (\d+)/
        );
        const code = match ? match[1] : 'unknown';
        throw new UploadError(`Failed to check build status: ${code}`);
      }
      const build = resp?.build ?? resp;

      if (build.status === 'completed') {
        // Extract comparison data for the response
        const result = {
          status: 'completed',
          build,
        };

        // Add comparison summary if available
        if (typeof build.comparisonsTotal === 'number') {
          result.comparisons = build.comparisonsTotal;
          result.passedComparisons = build.comparisonsPassed || 0;
          result.failedComparisons = build.comparisonsFailed || 0;
        } else {
          // Ensure failedComparisons is always a number, even when comparison data is missing
          // This prevents the run command exit code check from failing
          result.passedComparisons = 0;
          result.failedComparisons = 0;
        }

        // Add build URL if available
        if (build.url) {
          result.url = build.url;
        }

        return result;
      }

      if (build.status === 'failed') {
        throw new UploadError(
          `Build failed: ${build.error || 'Unknown error'}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new TimeoutError(`Build timed out after ${timeout}ms`, {
      buildId,
      timeout,
      elapsed: Date.now() - startTime,
    });
  }

  return { upload, waitForBuild };
}

/**
 * Find all PNG screenshots in a directory
 */
async function findScreenshots(directory) {
  const pattern = `${directory}/**/*.png`;
  return glob(pattern, { absolute: true });
}

/**
 * Process files to extract metadata and compute hashes
 */
async function* processFilesGenerator(files, signal) {
  for (const filePath of files) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const buffer = await readFile(filePath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    yield {
      path: filePath,
      filename: basename(filePath),
      buffer,
      sha256,
    };
  }
}

async function processFiles(files, signal, onProgress) {
  const results = [];
  let count = 0;

  for await (const file of processFilesGenerator(files, signal)) {
    results.push(file);
    count++;

    if (count % 10 === 0 || count === files.length) {
      onProgress(count);
    }
  }

  return results;
}

/**
 * Check which files already exist on the server
 */
async function checkExistingFiles(fileMetadata, api, signal) {
  const allShas = fileMetadata.map(f => f.sha256);
  const existingShas = new Set();

  // Check in batches
  for (let i = 0; i < allShas.length; i += DEFAULT_SHA_CHECK_BATCH_SIZE) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = allShas.slice(i, i + DEFAULT_SHA_CHECK_BATCH_SIZE);

    try {
      const res = await api.request('/api/sdk/check-shas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shas: batch }),
        signal,
      });
      const { existing = [] } = res || {};
      existing.forEach(sha => existingShas.add(sha));
    } catch (error) {
      // Continue without deduplication on error
      console.debug(
        'SHA check failed, continuing without deduplication:',
        error.message
      );
    }
  }

  return {
    toUpload: fileMetadata.filter(f => !existingShas.has(f.sha256)),
    existing: fileMetadata.filter(f => existingShas.has(f.sha256)),
  };
}

/**
 * Upload files to Vizzly
 */
async function uploadFiles({
  toUpload,
  existing,
  buildInfo,
  api,
  signal,
  batchSize,
  onProgress,
}) {
  let buildId = null;
  let result = null;

  // If all files exist, just create a build
  if (toUpload.length === 0) {
    return createBuildWithExisting({ existing, buildInfo, api, signal });
  }

  // Upload in batches
  for (let i = 0; i < toUpload.length; i += batchSize) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = toUpload.slice(i, i + batchSize);
    const isFirstBatch = i === 0;

    const form = new FormData();

    if (isFirstBatch) {
      // First batch creates the build
      form.append('build_name', buildInfo.name);
      form.append('branch', buildInfo.branch);
      form.append('environment', buildInfo.environment);

      if (buildInfo.commitSha) form.append('commit_sha', buildInfo.commitSha);
      if (buildInfo.commitMessage)
        form.append('commit_message', buildInfo.commitMessage);
      if (buildInfo.threshold !== undefined)
        form.append('threshold', buildInfo.threshold.toString());

      // Include existing SHAs
      if (existing.length > 0) {
        form.append(
          'existing_shas',
          JSON.stringify(existing.map(f => f.sha256))
        );
      }
    } else {
      // Subsequent batches add to existing build
      form.append('build_id', buildId);
    }

    // Add files
    for (const file of batch) {
      const blob = new Blob([file.buffer], { type: 'image/png' });
      form.append('screenshots', blob, file.filename);
    }

    try {
      result = await api.request('/api/sdk/upload', {
        method: 'POST',
        body: form,
        signal,
        headers: {},
      });
    } catch (err) {
      throw new UploadError(`Upload failed: ${err.message}`, {
        batch: i / batchSize + 1,
      });
    }

    if (isFirstBatch && result.build?.id) {
      buildId = result.build.id;
    }

    onProgress(i + batch.length);
  }

  return {
    buildId: result.build?.id || buildId,
    url: result.build?.url || result.url,
  };
}

/**
 * Create a build with only existing files
 */
async function createBuildWithExisting({ existing, buildInfo, api, signal }) {
  const form = new FormData();

  form.append('build_name', buildInfo.name);
  form.append('branch', buildInfo.branch);
  form.append('environment', buildInfo.environment);
  form.append('existing_shas', JSON.stringify(existing.map(f => f.sha256)));

  if (buildInfo.commitSha) form.append('commit_sha', buildInfo.commitSha);
  if (buildInfo.commitMessage)
    form.append('commit_message', buildInfo.commitMessage);
  if (buildInfo.threshold !== undefined)
    form.append('threshold', buildInfo.threshold.toString());

  let result;
  try {
    result = await api.request('/api/sdk/upload', {
      method: 'POST',
      body: form,
      signal,
      headers: {},
    });
  } catch (err) {
    throw new UploadError(`Failed to create build: ${err.message}`);
  }
  return {
    buildId: result.build?.id,
    url: result.build?.url || result.url,
  };
}

/**
 * Uploader class for handling screenshot uploads
 */
// Legacy Uploader class removed — all functionality lives in createUploader.
