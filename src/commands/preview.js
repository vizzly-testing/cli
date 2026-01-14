/**
 * Preview command implementation
 *
 * Uploads static files as a preview for a Vizzly build.
 * The build is automatically detected from session file or environment.
 */

import { exec, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, realpath, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  createApiClient as defaultCreateApiClient,
  uploadPreviewZip as defaultUploadPreviewZip,
} from '../api/index.js';
import { openBrowser as defaultOpenBrowser } from '../utils/browser.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { detectBranch as defaultDetectBranch } from '../utils/git.js';
import * as defaultOutput from '../utils/output.js';
import {
  formatSessionAge as defaultFormatSessionAge,
  readSession as defaultReadSession,
} from '../utils/session.js';

let execAsync = promisify(exec);

/**
 * Validate path for shell safety - prevents command injection
 * @param {string} path - Path to validate
 * @returns {boolean} true if path is safe for shell use
 */
function isPathSafe(path) {
  // Reject paths with shell metacharacters that could enable command injection
  let dangerousChars = /[`$;&|<>(){}[\]\\!*?'"]/;
  return !dangerousChars.test(path);
}

/**
 * Check if a command exists on the system
 * @param {string} command - Command to check
 * @returns {boolean}
 */
function commandExists(command) {
  try {
    let checkCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${checkCmd} ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the appropriate zip command for the current platform
 * @returns {{ command: string, available: boolean }}
 */
function getZipCommand() {
  // Check for standard zip command (macOS, Linux, Windows with Git Bash)
  if (commandExists('zip')) {
    return { command: 'zip', available: true };
  }

  // Windows: Check for PowerShell Compress-Archive
  if (process.platform === 'win32') {
    return { command: 'powershell', available: true };
  }

  return { command: null, available: false };
}

/**
 * Create a ZIP file from a directory using system commands
 * @param {string} sourceDir - Directory to zip
 * @param {string} outputPath - Path for output ZIP file
 * @returns {Promise<void>}
 */
async function createZipWithSystem(sourceDir, outputPath) {
  let { command, available } = getZipCommand();

  if (!available) {
    throw new Error(
      'No zip command found. Please install zip or use PowerShell on Windows.'
    );
  }

  // Validate paths to prevent command injection
  // Note: outputPath is internally generated (tmpdir + random), so always safe
  // sourceDir comes from user input, so we validate it
  if (!isPathSafe(sourceDir)) {
    throw new Error(
      'Path contains unsupported characters. Please use a path without special shell characters.'
    );
  }

  if (command === 'zip') {
    // Standard zip command - create ZIP from directory contents
    // Using cwd option is safe as it's not part of the command string
    // -r: recursive, -q: quiet
    await execAsync(`zip -r -q "${outputPath}" .`, {
      cwd: sourceDir,
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    });
  } else if (command === 'powershell') {
    // Windows PowerShell - use -LiteralPath for safer path handling
    // Escape single quotes in paths by doubling them
    let safeSrcDir = sourceDir.replace(/'/g, "''");
    let safeOutPath = outputPath.replace(/'/g, "''");
    await execAsync(
      `powershell -Command "Compress-Archive -LiteralPath '${safeSrcDir}\\*' -DestinationPath '${safeOutPath}' -Force"`,
      { maxBuffer: 1024 * 1024 * 100 }
    );
  }
}

/**
 * Count files in a directory recursively
 * Skips symlinks to prevent path traversal attacks
 * @param {string} dir - Directory path
 * @returns {Promise<{ count: number, totalSize: number }>}
 */
async function countFiles(dir) {
  let { readdir } = await import('node:fs/promises');
  let count = 0;
  let totalSize = 0;

  // Resolve the base directory to an absolute path for traversal checks
  let baseDir = await realpath(resolve(dir));

  async function walk(currentDir) {
    let entries = await readdir(currentDir, { withFileTypes: true });

    for (let entry of entries) {
      let fullPath = join(currentDir, entry.name);

      // Skip symlinks to prevent traversal attacks
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        // Skip hidden directories and common non-content directories
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === '__pycache__'
        ) {
          continue;
        }

        // Verify we're still within the base directory (prevent traversal)
        let realSubDir = await realpath(fullPath);
        if (!realSubDir.startsWith(baseDir)) {
          continue;
        }

        await walk(fullPath);
      } else if (entry.isFile()) {
        // Skip hidden files
        if (entry.name.startsWith('.')) {
          continue;
        }
        count++;
        let fileStat = await stat(fullPath);
        totalSize += fileStat.size;
      }
    }
  }

  await walk(baseDir);
  return { count, totalSize };
}

/**
 * Format bytes for display
 * @param {number} bytes - Bytes to format
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Preview command implementation
 * @param {string} path - Path to static files
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function previewCommand(
  path,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    uploadPreviewZip = defaultUploadPreviewZip,
    readSession = defaultReadSession,
    formatSessionAge = defaultFormatSessionAge,
    detectBranch = defaultDetectBranch,
    openBrowser = defaultOpenBrowser,
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
      return { success: false, reason: 'no-api-key' };
    }

    // Validate path exists and is a directory
    if (!existsSync(path)) {
      output.error(`Path does not exist: ${path}`);
      exit(1);
      return { success: false, reason: 'path-not-found' };
    }

    let pathStat = statSync(path);
    if (!pathStat.isDirectory()) {
      output.error(`Path is not a directory: ${path}`);
      exit(1);
      return { success: false, reason: 'not-a-directory' };
    }

    // Resolve build ID
    let buildId = options.build;
    let buildSource = 'flag';

    if (!buildId && options.parallelId) {
      // TODO: Look up build by parallel ID
      output.error(
        'Parallel ID lookup not yet implemented. Use --build to specify build ID directly.'
      );
      exit(1);
      return { success: false, reason: 'parallel-id-not-implemented' };
    }

    if (!buildId) {
      // Try to read from session
      let currentBranch = await detectBranch();
      let session = readSession({ currentBranch });

      if (session?.buildId && !session.expired) {
        if (session.branchMismatch) {
          output.warn(
            `Session build is from different branch (${session.branch})`
          );
          output.hint(
            `Use --build to specify a build ID, or run tests on this branch first.`
          );
          exit(1);
          return { success: false, reason: 'branch-mismatch' };
        }

        buildId = session.buildId;
        buildSource = session.source;

        if (globalOptions.verbose) {
          output.info(
            `Using build ${buildId} from ${buildSource} (${formatSessionAge(session.age)})`
          );
        }
      }
    }

    if (!buildId) {
      output.error('No build found');
      output.blank();
      output.print('  Run visual tests first, then upload your preview:');
      output.blank();
      output.print('    vizzly run "npm test"');
      output.print('    vizzly preview ./dist');
      output.blank();
      output.print('  Or specify a build explicitly:');
      output.blank();
      output.print('    vizzly preview ./dist --build <build-id>');
      output.blank();
      exit(1);
      return { success: false, reason: 'no-build' };
    }

    // Check for zip command availability
    let zipInfo = getZipCommand();
    if (!zipInfo.available) {
      output.error(
        'No zip command found. Please install zip (macOS/Linux) or ensure PowerShell is available (Windows).'
      );
      exit(1);
      return { success: false, reason: 'no-zip-command' };
    }

    // Count files and calculate size
    output.startSpinner('Scanning files...');
    let { count: fileCount, totalSize } = await countFiles(path);

    if (fileCount === 0) {
      output.stopSpinner();
      output.error(`No files found in ${path}`);
      exit(1);
      return { success: false, reason: 'no-files' };
    }

    output.updateSpinner(
      `Found ${fileCount} files (${formatBytes(totalSize)})`
    );

    // Create ZIP using system command
    output.updateSpinner('Compressing files...');
    // Use timestamp + random bytes for unique temp file (prevents race conditions)
    let randomSuffix = randomBytes(8).toString('hex');
    let zipPath = join(
      tmpdir(),
      `vizzly-preview-${Date.now()}-${randomSuffix}.zip`
    );

    let zipBuffer;
    try {
      await createZipWithSystem(path, zipPath);
      zipBuffer = await readFile(zipPath);
    } catch (zipError) {
      output.stopSpinner();
      output.error(`Failed to create ZIP: ${zipError.message}`);
      await unlink(zipPath).catch(() => {});
      exit(1);
      return { success: false, reason: 'zip-failed', error: zipError };
    } finally {
      // Always clean up temp file
      await unlink(zipPath).catch(() => {});
    }

    let compressionRatio = ((1 - zipBuffer.length / totalSize) * 100).toFixed(
      0
    );
    output.updateSpinner(
      `Compressed to ${formatBytes(zipBuffer.length)} (${compressionRatio}% smaller)`
    );

    // Upload
    output.updateSpinner('Uploading preview...');
    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'preview',
    });

    let result = await uploadPreviewZip(client, buildId, zipBuffer);
    output.stopSpinner();

    // Success output
    if (globalOptions.json) {
      output.data({
        success: true,
        buildId,
        previewUrl: result.previewUrl,
        files: result.uploaded,
        totalBytes: result.totalBytes,
        newBytes: result.newBytes,
        deduplicationRatio: result.deduplicationRatio,
      });
    } else {
      output.complete('Preview uploaded');
      output.blank();

      let colors = output.getColors();
      output.print(
        `  ${colors.brand.textTertiary('Files')}       ${colors.white(result.uploaded)} (${formatBytes(result.totalBytes)} compressed)`
      );

      if (result.reusedBlobs > 0) {
        let savedBytes = result.totalBytes - result.newBytes;
        output.print(
          `  ${colors.brand.textTertiary('Deduped')}     ${colors.green(result.reusedBlobs)} files (saved ${formatBytes(savedBytes)})`
        );
      }

      if (result.basePath) {
        output.print(
          `  ${colors.brand.textTertiary('Base path')}   ${colors.dim(result.basePath)}`
        );
      }

      output.blank();
      output.print(
        `  ${colors.brand.textTertiary('Preview')}     ${colors.cyan(colors.underline(result.previewUrl))}`
      );

      // Open in browser if requested
      if (options.open) {
        let opened = await openBrowser(result.previewUrl);
        if (opened) {
          output.print(`  ${colors.dim('Opened in browser')}`);
        }
      }
    }

    output.cleanup();
    return { success: true, result };
  } catch (error) {
    output.stopSpinner();

    // Handle specific error types
    if (error.status === 404) {
      output.error(`Build not found: ${options.build || 'from session'}`);
    } else if (error.status === 403) {
      if (error.message?.includes('Starter')) {
        output.error('Preview hosting requires Starter plan or above');
        output.hint(
          'Upgrade your plan at https://app.vizzly.dev/settings/billing'
        );
      } else {
        output.error('Access denied', error);
      }
    } else {
      output.error('Preview upload failed', error);
    }

    exit(1);
    return { success: false, error };
  } finally {
    output.cleanup();
  }
}

/**
 * Validate preview options
 * @param {string} path - Path to static files
 * @param {Object} options - Command options
 */
export function validatePreviewOptions(path, _options) {
  let errors = [];

  if (!path || path.trim() === '') {
    errors.push('Path to static files is required');
  }

  return errors;
}
