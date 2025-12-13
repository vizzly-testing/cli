/**
 * Vizzly Screenshot Uploader
 * Handles screenshot uploads to the Vizzly platform
 */

import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { glob } from 'glob';
import { checkShas, createApiClient, createBuild } from '../api/index.js';
import {
  TimeoutError,
  UploadError,
  ValidationError,
} from '../errors/vizzly-error.js';
import { getDefaultBranch } from '../utils/git.js';
import * as output from '../utils/output.js';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_SHA_CHECK_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Create a new uploader instance
 */
export function createUploader(
  { apiKey, apiUrl, userAgent, command, upload: uploadConfig = {} } = {},
  options = {}
) {
  const signal = options.signal || new AbortController().signal;
  const client = createApiClient({
    baseUrl: apiUrl,
    token: apiKey,
    command: command || 'upload',
    sdkUserAgent: userAgent,
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
    pullRequestNumber,
    parallelId,
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

      onProgress({
        phase: 'scanning',
        message: `Found ${files.length} screenshots`,
        total: files.length,
      });

      // Process files to get metadata
      const fileMetadata = await processFiles(files, signal, current =>
        onProgress({
          phase: 'processing',
          message: `Processing files`,
          current,
          total: files.length,
        })
      );

      // Create build first to get buildId for SHA checking
      const buildInfo = {
        name: buildName || `Upload ${new Date().toISOString()}`,
        branch: branch || (await getDefaultBranch()) || 'main',
        commit_sha: commit,
        commit_message: message,
        environment,
        threshold,
        github_pull_request_number: pullRequestNumber,
        parallel_id: parallelId,
      };

      const build = await createBuild(client, buildInfo);
      const buildId = build.id;

      // Check which files need uploading (now with buildId)
      const { toUpload, existing, screenshots } = await checkExistingFiles(
        fileMetadata,
        client,
        signal,
        buildId
      );

      onProgress({
        phase: 'deduplication',
        message: `Checking for duplicates (${toUpload.length} to upload, ${existing.length} existing)`,
        toUpload: toUpload.length,
        existing: existing.length,
        total: files.length,
      });

      // Upload remaining files
      const result = await uploadFiles({
        toUpload,
        existing,
        screenshots,
        buildId,
        buildInfo,
        client,
        signal,
        batchSize: batchSize,
        onProgress: current =>
          onProgress({
            phase: 'uploading',
            message: `Uploading screenshots`,
            current,
            total: toUpload.length,
          }),
      });

      onProgress({
        phase: 'completed',
        message: `Upload completed`,
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
      output.debug('upload', 'failed', { error: error.message });

      // Re-throw if already a VizzlyError
      if (error.name?.includes('Error') && error.code) {
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
        resp = await client.request(`/api/sdk/builds/${buildId}`, { signal });
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
 * Check which files already exist on the server using signature-based deduplication
 */
async function checkExistingFiles(fileMetadata, client, signal, buildId) {
  const existingShas = new Set();
  const allScreenshots = [];

  // Check in batches using the new signature-based format
  for (let i = 0; i < fileMetadata.length; i += DEFAULT_SHA_CHECK_BATCH_SIZE) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = fileMetadata.slice(i, i + DEFAULT_SHA_CHECK_BATCH_SIZE);

    // Convert file metadata to screenshot objects with signature data
    const screenshotBatch = batch.map(file => ({
      sha256: file.sha256,
      name: file.filename.replace(/\.png$/, ''), // Remove .png extension for name
      // Extract browser from filename if available (e.g., "homepage-chrome.png" -> "chrome")
      browser: extractBrowserFromFilename(file.filename) || 'chrome', // Default to chrome
      // Default viewport dimensions (these could be extracted from filename or metadata if available)
      viewport_width: 1920,
      viewport_height: 1080,
    }));

    try {
      const res = await checkShas(client, screenshotBatch, buildId);
      const { existing = [], screenshots = [] } = res || {};
      for (let sha of existing) {
        existingShas.add(sha);
      }
      allScreenshots.push(...screenshots);
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
    screenshots: allScreenshots,
  };
}

/**
 * Extract browser name from filename
 * @param {string} filename - The screenshot filename
 * @returns {string|null} Browser name or null if not found
 */
function extractBrowserFromFilename(filename) {
  const browsers = ['chrome', 'firefox', 'safari', 'edge', 'webkit'];
  const lowerFilename = filename.toLowerCase();

  for (const browser of browsers) {
    if (lowerFilename.includes(browser)) {
      return browser;
    }
  }

  return null;
}

/**
 * Upload files to Vizzly
 */
async function uploadFiles({
  toUpload,
  buildId,
  client,
  signal,
  batchSize,
  onProgress,
}) {
  let result = null;

  // If all files exist, screenshot records were already created during SHA check
  if (toUpload.length === 0) {
    return { buildId, url: null }; // Build was already created
  }

  // Upload in batches
  for (let i = 0; i < toUpload.length; i += batchSize) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = toUpload.slice(i, i + batchSize);

    const form = new FormData();

    // All batches add to existing build (build was created earlier)
    form.append('build_id', buildId);

    // Add files
    for (const file of batch) {
      const blob = new Blob([file.buffer], { type: 'image/png' });
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
      throw new UploadError(`Upload failed: ${err.message}`, {
        batch: i / batchSize + 1,
      });
    }

    onProgress(i + batch.length);
  }

  return {
    buildId,
    url: result?.build?.url || result?.url,
  };
}

// createBuildWithExisting function removed - no longer needed since
// builds are created first and /check-shas automatically creates screenshot records

/**
 * Uploader class for handling screenshot uploads
 */
// Legacy Uploader class removed — all functionality lives in createUploader.
