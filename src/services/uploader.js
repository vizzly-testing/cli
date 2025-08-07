/**
 * Vizzly Screenshot Uploader
 * Handles screenshot uploads to the Vizzly platform
 */

import { glob } from 'glob';
import { readFile, readdir, stat } from 'fs/promises';
import { readFileSync } from 'fs';
import { basename, join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

/**
 * Generate User-Agent string with version, command, and optional SDK info
 * @param {string} [command] - The command being executed (e.g., 'upload', 'run')
 * @param {string} [sdkUserAgent] - Additional user agent info from SDK
 * @returns {string} Formatted user agent string
 */
function getUserAgent(command = 'upload', sdkUserAgent) {
  const baseUserAgent = `vizzly-cli/${packageJson.version} (${command})`;
  return sdkUserAgent ? `${baseUserAgent} ${sdkUserAgent}` : baseUserAgent;
}
import { getDefaultBranch } from '../utils/git.js';
import { fetchWithTimeout } from '../utils/fetch-utils.js';
import {
  VizzlyError,
  UploadError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from '../errors/vizzly-error.js';
import { BaseService } from './base-service.js';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_SHA_CHECK_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT = 300000; // 5 minutes

/**
 * Create a new uploader instance
 */
export function createUploader(
  { apiKey, apiUrl, userAgent, command },
  options = {}
) {
  const logger =
    options.logger || createLogger({ level: options.logLevel || 'info' });
  const signal = options.signal || new AbortController().signal;

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
        { apiKey, apiUrl, command, userAgent },
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
        apiKey,
        apiUrl,
        command,
        userAgent,
        signal,
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
  async function waitForBuild(buildId, timeout = DEFAULT_TIMEOUT) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (signal.aborted) {
        throw new UploadError('Operation cancelled', { buildId });
      }

      const response = await fetchWithTimeout(
        `${apiUrl}/api/sdk/builds/${buildId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': getUserAgent(command, userAgent),
          },
          signal,
        }
      );

      if (!response.ok) {
        throw new NetworkError(
          `Failed to check build status: ${response.status}`,
          {
            buildId,
            status: response.status,
            statusText: response.statusText,
          }
        );
      }

      const { build } = await response.json();

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
async function checkExistingFiles(
  fileMetadata,
  { apiKey, apiUrl, command = 'upload', userAgent } = {},
  signal
) {
  const allShas = fileMetadata.map(f => f.sha256);
  const existingShas = new Set();

  // Check in batches
  for (let i = 0; i < allShas.length; i += DEFAULT_SHA_CHECK_BATCH_SIZE) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = allShas.slice(i, i + DEFAULT_SHA_CHECK_BATCH_SIZE);

    try {
      const response = await fetchWithTimeout(`${apiUrl}/api/sdk/check-shas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': getUserAgent(command, userAgent),
        },
        body: JSON.stringify({ shas: batch }),
        signal,
      });

      if (response.ok) {
        const { existing = [] } = await response.json();
        existing.forEach(sha => existingShas.add(sha));
      }
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
  apiKey,
  apiUrl,
  signal,
  onProgress,
  command = 'upload',
  userAgent,
}) {
  let buildId = null;
  let result = null;

  // If all files exist, just create a build
  if (toUpload.length === 0) {
    return createBuildWithExisting({
      existing,
      buildInfo,
      apiKey,
      apiUrl,
      command,
      userAgent,
      signal,
    });
  }

  // Upload in batches
  for (let i = 0; i < toUpload.length; i += DEFAULT_BATCH_SIZE) {
    if (signal.aborted) throw new UploadError('Operation cancelled');

    const batch = toUpload.slice(i, i + DEFAULT_BATCH_SIZE);
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

    const response = await fetchWithTimeout(`${apiUrl}/api/sdk/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': getUserAgent(command, userAgent),
      },
      body: form,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new UploadError(`Upload failed: ${response.status} ${errorText}`, {
        status: response.status,
        batch: i / DEFAULT_BATCH_SIZE + 1,
        response: errorText,
      });
    }

    result = await response.json();

    if (isFirstBatch && result.build?.id) {
      buildId = result.build.id;
    }

    onProgress(i + batch.length);
  }

  return {
    buildId: result.build?.id || buildId,
    url: result.url,
  };
}

/**
 * Create a build with only existing files
 */
async function createBuildWithExisting({
  existing,
  buildInfo,
  apiKey,
  apiUrl,
  signal,
  command = 'upload',
  userAgent,
}) {
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

  const response = await fetchWithTimeout(`${apiUrl}/api/sdk/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': getUserAgent(command, userAgent),
    },
    body: form,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new UploadError(
      `Failed to create build: ${response.status} ${errorText}`,
      {
        status: response.status,
        response: errorText,
      }
    );
  }

  const result = await response.json();
  return {
    buildId: result.build?.id,
    url: result.url,
  };
}

/**
 * Uploader class for handling screenshot uploads
 */
export class Uploader extends BaseService {
  constructor(config, logger) {
    super(config, { logger });
    this.apiUrl = config.apiUrl || 'https://vizzly.dev';
    this.apiKey = config.apiKey;
    this.userAgent = getUserAgent(config.command || 'upload', config.userAgent);
  }

  async onStart() {
    // No axios client needed - we use fetch
  }

  async onStop() {
    // Clean up any pending requests
  }

  /**
   * Upload a directory of screenshots
   */
  async uploadDirectory(dirPath, options = {}) {
    const stats = await stat(dirPath);

    if (!stats.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`);
    }

    const files = await this.findScreenshots(dirPath);

    if (files.length === 0) {
      throw new Error('No screenshot files found');
    }

    // Create build
    const build = await this.api.createBuild({
      name: options.buildName || `Upload from ${new Date().toISOString()}`,
      metadata: options.metadata,
    });

    // Upload screenshots
    const results = [];
    for (const file of files) {
      const buffer = await readFile(file);
      const name = this.getScreenshotName(file, dirPath);

      try {
        const result = await this.api.uploadScreenshot(
          build.id,
          name,
          buffer,
          options.metadata
        );
        results.push({ file, name, success: true, result });
      } catch (error) {
        results.push({ file, name, success: false, error: error.message });
      }
    }

    // Finalize build
    await this.api.finalizeBuild(build.id);

    return {
      build,
      results,
      summary: {
        total: results.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    };
  }

  async findScreenshots(dirPath) {
    const files = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.findScreenshots(fullPath);
        files.push(...subFiles);
      } else if (this.isScreenshotFile(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  isScreenshotFile(filename) {
    const ext = extname(filename).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  }

  getScreenshotName(filePath, basePath) {
    const relativePath = filePath.replace(basePath, '').replace(/^\//, '');
    return relativePath.replace(extname(relativePath), '');
  }

  /**
   * Make authenticated API request
   * @private
   */
  async apiRequest(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': this.userAgent,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new VizzlyError(
        `API request failed: ${response.statusText}`,
        'API_REQUEST_FAILED',
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          endpoint,
        }
      );
    }

    return response.json();
  }

  /**
   * Create a new build
   * @private
   */
  async createBuild(options) {
    return this.apiRequest('/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: options.buildName,
        environment: options.environment,
        branch: options.branch,
        commitSha: options.commitSha,
        commitMessage: options.commitMessage,
        tags: options.tags,
      }),
    });
  }

  /**
   * Upload screenshot batch
   * @private
   */
  async uploadBatch(screenshots, buildId, controller) {
    const formData = new FormData();

    for (const screenshot of screenshots) {
      if (controller?.signal?.aborted) {
        throw new VizzlyError('Upload aborted', 'UPLOAD_ABORTED');
      }

      formData.append('screenshots', createReadStream(screenshot.path), {
        filename: screenshot.name,
        contentType: 'image/png',
      });

      formData.append(
        'metadata',
        JSON.stringify({
          name: screenshot.name,
          properties: screenshot.properties || {},
        })
      );
    }

    formData.append('buildId', buildId);

    // FormData needs special handling with fetch
    const response = await fetch(`${this.apiUrl}/screenshots/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': this.userAgent,
        ...formData.getHeaders(),
      },
      body: formData,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new VizzlyError(
        `Upload failed: ${response.statusText}`,
        'UPLOAD_FAILED',
        { status: response.status, error: errorText }
      );
    }

    return response.json();
  }

  /**
   * Get build status
   * @private
   */
  async getBuildStatus(buildId) {
    return this.apiRequest(`/builds/${buildId}`);
  }
}
