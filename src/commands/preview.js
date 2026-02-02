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
  getBuild as defaultGetBuild,
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

// Maximum files to show in dry-run output (use --verbose for all)
let DRY_RUN_FILE_LIMIT = 50;

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

// Default directories to exclude from preview uploads
let DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '__pycache__',
  '.git',
  '.svn',
  '.hg',
  '.vizzly',
  'coverage',
  '.nyc_output',
  '.cache',
  '.turbo',
  '.next/cache',
  '.nuxt',
  '.output',
  '.vercel',
  '.netlify',
  'tests',
  'test',
  '__tests__',
  'spec',
  '__mocks__',
  'playwright-report',
  'cypress',
  '.playwright',
];

// Default file patterns to exclude from preview uploads
let DEFAULT_EXCLUDED_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '*.config.js',
  '*.config.ts',
  '*.config.mjs',
  '*.config.cjs',
  'tsconfig.json',
  'jsconfig.json',
  '.eslintrc*',
  '.prettierrc*',
  'Makefile',
  'Dockerfile',
  'docker-compose*.yml',
  '*.md',
  '*.log',
  '*.map',
];

/**
 * Check if a filename matches any of the exclusion patterns
 * @param {string} filename - Filename to check
 * @param {string[]} patterns - Patterns to match against
 * @returns {boolean}
 */
function matchesPattern(filename, patterns) {
  for (let pattern of patterns) {
    if (pattern.includes('*')) {
      // Simple glob matching - convert to regex
      let regex = new RegExp(
        `^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`
      );
      if (regex.test(filename)) return true;
    } else {
      if (filename === pattern) return true;
    }
  }
  return false;
}

/**
 * Create a ZIP file from a directory using system commands
 * @param {string} sourceDir - Directory to zip
 * @param {string} outputPath - Path for output ZIP file
 * @param {Object} exclusions - Exclusion patterns
 * @param {string[]} exclusions.dirs - Directory names to exclude
 * @param {string[]} exclusions.files - File patterns to exclude
 * @returns {Promise<void>}
 */
async function createZipWithSystem(sourceDir, outputPath, exclusions = {}) {
  let { command, available } = getZipCommand();
  let { dirs = [], files = [] } = exclusions;

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

  // Validate exclusion patterns to prevent command injection
  // Only allow safe characters in patterns: alphanumeric, dots, asterisks, underscores, hyphens, slashes
  let safePatternRegex = /^[a-zA-Z0-9.*_\-/]+$/;
  for (let pattern of [...dirs, ...files]) {
    if (!safePatternRegex.test(pattern)) {
      throw new Error(
        `Exclusion pattern contains unsafe characters: ${pattern}. Only alphanumeric, ., *, _, -, / are allowed.`
      );
    }
  }

  if (command === 'zip') {
    // Standard zip command - create ZIP from directory contents
    // Using cwd option is safe as it's not part of the command string
    // -r: recursive, -q: quiet, -x: exclude patterns
    let excludeArgs = [
      ...dirs.map(dir => `-x "${dir}/*"`),
      ...files.map(pattern => `-x "${pattern}"`),
    ].join(' ');
    await execAsync(`zip -r -q "${outputPath}" . ${excludeArgs}`, {
      cwd: sourceDir,
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    });
  } else if (command === 'powershell') {
    // Windows PowerShell - Compress-Archive doesn't support exclusions,
    // so we create a temp directory with only the files we want
    let safeSrcDir = sourceDir.replace(/'/g, "''");
    let safeOutPath = outputPath.replace(/'/g, "''");

    // Build exclusion filter for PowerShell
    // We use Get-ChildItem with -Exclude and pipe to Compress-Archive
    let excludePatterns = [...dirs, ...files].map(p => `'${p}'`).join(',');

    if (excludePatterns) {
      // Use robocopy to copy files excluding patterns, then zip
      // This is more reliable than PowerShell's native filtering
      await execAsync(
        `powershell -Command "` +
          `$src = '${safeSrcDir}'; ` +
          `$dst = '${safeOutPath}'; ` +
          `$exclude = @(${excludePatterns}); ` +
          `$items = Get-ChildItem -Path $src -Recurse -File | Where-Object { ` +
          `$rel = $_.FullName.Substring($src.Length + 1); ` +
          `$dominated = $false; ` +
          `foreach ($ex in $exclude) { if ($rel -like $ex -or $rel -like \\"$ex/*\\" -or $_.Name -like $ex) { $dominated = $true; break } }; ` +
          `-not $dominated ` +
          `}; ` +
          `if ($items) { $items | Compress-Archive -DestinationPath $dst -Force }"`,
        { maxBuffer: 1024 * 1024 * 100 }
      );
    } else {
      await execAsync(
        `powershell -Command "Compress-Archive -LiteralPath '${safeSrcDir}\\*' -DestinationPath '${safeOutPath}' -Force"`,
        { maxBuffer: 1024 * 1024 * 100 }
      );
    }
  }
}

/**
 * Count files in a directory recursively
 * Skips symlinks to prevent path traversal attacks
 * @param {string} dir - Directory path
 * @param {Object} options - Options
 * @param {boolean} options.collectPaths - Whether to collect file paths
 * @param {string[]} options.excludedDirs - Directory names to exclude
 * @param {string[]} options.excludedFiles - File patterns to exclude
 * @returns {Promise<{ count: number, totalSize: number, files?: Array<{path: string, size: number}> }>}
 */
async function countFiles(dir, options = {}) {
  let { readdir } = await import('node:fs/promises');
  let {
    collectPaths = false,
    excludedDirs = DEFAULT_EXCLUDED_DIRS,
    excludedFiles = DEFAULT_EXCLUDED_FILES,
  } = options;

  let count = 0;
  let totalSize = 0;
  let files = collectPaths ? [] : null;

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
        // Skip hidden directories and excluded directories
        if (entry.name.startsWith('.') || excludedDirs.includes(entry.name)) {
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

        // Skip excluded file patterns
        if (matchesPattern(entry.name, excludedFiles)) {
          continue;
        }

        count++;
        let fileStat = await stat(fullPath);
        totalSize += fileStat.size;

        if (files) {
          // Store relative path from base directory
          let relativePath = fullPath.slice(baseDir.length + 1);
          files.push({ path: relativePath, size: fileStat.size });
        }
      }
    }
  }

  await walk(baseDir);
  return { count, totalSize, files };
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
    getBuild = defaultGetBuild,
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

    // Validate API token (skip for dry-run)
    if (!options.dryRun && !config.apiKey) {
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

    // Create API client for non-dry-run operations (reused for visibility check and upload)
    let client;
    if (!options.dryRun) {
      client = createApiClient({
        baseUrl: config.apiUrl,
        token: config.apiKey,
        command: 'preview',
      });

      // Check project visibility for private projects
      let build;
      try {
        build = await getBuild(client, buildId);
      } catch (error) {
        if (error.status === 404) {
          output.error(`Build not found: ${buildId}`);
        } else {
          output.error('Failed to verify project visibility', error);
        }
        exit(1);
        // Return is for testing (exit is mocked in tests)
        return { success: false, reason: 'build-fetch-failed', error };
      }

      // Check if project is private and user hasn't acknowledged public link access
      // Use === false to handle undefined/missing isPublic defensively
      let isPrivate = build.project && build.project.isPublic === false;
      if (isPrivate && !options.publicLink) {
        output.error('This project is private.');
        output.blank();
        output.print(
          '  Preview URLs grant access to anyone with the link (until expiration).'
        );
        output.blank();
        output.print('  To proceed, acknowledge this by using:');
        output.blank();
        output.print('    vizzly preview ./dist --public-link');
        output.blank();
        output.print('  Or set your project to public in Vizzly settings.');
        output.blank();
        exit(1);
        // Return is for testing (exit is mocked in tests)
        return { success: false, reason: 'private-project-no-flag' };
      }
    }

    // Check for zip command availability (skip for dry-run)
    if (!options.dryRun) {
      let zipInfo = getZipCommand();
      if (!zipInfo.available) {
        output.error(
          'No zip command found. Please install zip (macOS/Linux) or ensure PowerShell is available (Windows).'
        );
        exit(1);
        return { success: false, reason: 'no-zip-command' };
      }
    }

    // Build exclusion lists from defaults and user options
    let excludedDirs = [...DEFAULT_EXCLUDED_DIRS];
    let excludedFiles = [...DEFAULT_EXCLUDED_FILES];

    // Add user-specified exclusions
    if (options.exclude) {
      let userExcludes = Array.isArray(options.exclude)
        ? options.exclude
        : [options.exclude];
      for (let pattern of userExcludes) {
        // If pattern ends with /, treat as directory
        if (pattern.endsWith('/')) {
          excludedDirs.push(pattern.slice(0, -1));
        } else {
          excludedFiles.push(pattern);
        }
      }
    }

    // Remove patterns that user explicitly wants to include
    if (options.include) {
      let userIncludes = Array.isArray(options.include)
        ? options.include
        : [options.include];
      for (let pattern of userIncludes) {
        if (pattern.endsWith('/')) {
          let dirName = pattern.slice(0, -1);
          excludedDirs = excludedDirs.filter(d => d !== dirName);
        } else {
          excludedFiles = excludedFiles.filter(f => f !== pattern);
        }
      }
    }

    let exclusions = { dirs: excludedDirs, files: excludedFiles };

    // Count files and calculate size
    output.startSpinner('Scanning files...');
    let {
      count: fileCount,
      totalSize,
      files,
    } = await countFiles(path, {
      collectPaths: options.dryRun,
      excludedDirs,
      excludedFiles,
    });

    if (fileCount === 0) {
      output.stopSpinner();
      output.error(`No files found in ${path}`);
      exit(1);
      return { success: false, reason: 'no-files' };
    }

    output.stopSpinner();

    // Dry run - show what would be uploaded and exit
    if (options.dryRun) {
      let colors = output.getColors();

      if (globalOptions.json) {
        output.data({
          dryRun: true,
          path: resolve(path),
          fileCount,
          totalSize,
          excludedDirs,
          excludedFiles,
          files: files.map(f => ({ path: f.path, size: f.size })),
        });
      } else {
        output.info(
          `Dry run - would upload ${fileCount} files (${formatBytes(totalSize)})`
        );
        output.blank();
        output.print(
          `  ${colors.brand.textTertiary('Source')}      ${resolve(path)}`
        );
        output.print(
          `  ${colors.brand.textTertiary('Files')}       ${fileCount}`
        );
        output.print(
          `  ${colors.brand.textTertiary('Total size')}  ${formatBytes(totalSize)}`
        );
        output.blank();

        // Show exclusions in verbose mode
        if (globalOptions.verbose) {
          output.print(
            `  ${colors.brand.textTertiary('Excluded directories:')}`
          );
          for (let dir of excludedDirs) {
            output.print(`    ${colors.dim(dir)}`);
          }
          output.blank();

          output.print(
            `  ${colors.brand.textTertiary('Excluded file patterns:')}`
          );
          for (let pattern of excludedFiles) {
            output.print(`    ${colors.dim(pattern)}`);
          }
          output.blank();
        }

        // Show files (limit in non-verbose mode)
        let displayFiles = globalOptions.verbose
          ? files
          : files.slice(0, DRY_RUN_FILE_LIMIT);
        let hasMore = files.length > displayFiles.length;

        output.print(`  ${colors.brand.textTertiary('Files to upload:')}`);
        for (let file of displayFiles) {
          output.print(
            `    ${file.path} ${colors.dim(`(${formatBytes(file.size)})`)}`
          );
        }

        if (hasMore) {
          output.print(
            `    ${colors.dim(`... and ${files.length - DRY_RUN_FILE_LIMIT} more (use --verbose to see all)`)}`
          );
        }
      }

      output.cleanup();
      return { success: true, dryRun: true, fileCount, totalSize, files };
    }

    output.startSpinner(`Found ${fileCount} files (${formatBytes(totalSize)})`);

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
      await createZipWithSystem(path, zipPath, exclusions);
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

    // Upload (reuse client created earlier)
    output.updateSpinner('Uploading preview...');
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
