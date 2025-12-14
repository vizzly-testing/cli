/**
 * Report Generator Operations - I/O operations with dependency injection
 *
 * Each operation takes its dependencies as parameters for testability.
 */

import {
  buildBundleDestPaths,
  buildBundleSourcePaths,
  buildHtmlContent,
  buildReportDir,
  buildReportPath,
  validateBundlesExist,
  validateReportData,
} from './core.js';

// ============================================================================
// File Operations
// ============================================================================

/**
 * Ensure a directory exists
 * @param {Object} options - Options
 * @param {string} options.path - Directory path
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.mkdir - mkdir function
 * @returns {Promise<void>}
 */
export async function ensureDirectory({ path, deps }) {
  let { mkdir } = deps;
  await mkdir(path, { recursive: true });
}

/**
 * Check if bundles exist
 * @param {Object} options - Options
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.existsSync - existsSync function
 * @returns {{ bundleExists: boolean, cssExists: boolean, bundlePath: string, cssPath: string }}
 */
export function checkBundlesExist({ projectRoot, deps }) {
  let { existsSync } = deps;
  let { bundlePath, cssPath } = buildBundleSourcePaths(projectRoot);

  return {
    bundleExists: existsSync(bundlePath),
    cssExists: existsSync(cssPath),
    bundlePath,
    cssPath,
  };
}

/**
 * Copy bundle files to report directory
 * @param {Object} options - Options
 * @param {string} options.bundlePath - Source bundle path
 * @param {string} options.cssPath - Source CSS path
 * @param {string} options.reportDir - Report directory
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.copyFile - copyFile function
 * @returns {Promise<void>}
 */
export async function copyBundles({ bundlePath, cssPath, reportDir, deps }) {
  let { copyFile } = deps;
  let { bundleDest, cssDest } = buildBundleDestPaths(reportDir);

  await copyFile(bundlePath, bundleDest);
  await copyFile(cssPath, cssDest);
}

/**
 * Write HTML content to file
 * @param {Object} options - Options
 * @param {string} options.path - File path
 * @param {string} options.content - HTML content
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.writeFile - writeFile function
 * @returns {Promise<void>}
 */
export async function writeHtmlFile({ path, content, deps }) {
  let { writeFile } = deps;
  await writeFile(path, content, 'utf8');
}

// ============================================================================
// Main Report Generation
// ============================================================================

/**
 * Generate a static HTML report with React reporter
 * @param {Object} options - Options
 * @param {Object} options.reportData - Report data
 * @param {string} options.workingDir - Working directory
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.mkdir - mkdir function
 * @param {Function} options.deps.existsSync - existsSync function
 * @param {Function} options.deps.copyFile - copyFile function
 * @param {Function} options.deps.writeFile - writeFile function
 * @param {Object} options.deps.output - Output utilities
 * @param {Function} options.deps.getDate - Function that returns current Date
 * @returns {Promise<string>} Path to generated report
 */
export async function generateReport({
  reportData,
  workingDir,
  projectRoot,
  deps,
}) {
  let { mkdir, existsSync, copyFile, writeFile, output, getDate } = deps;

  // Validate report data
  let validation = validateReportData(reportData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  let reportDir = buildReportDir(workingDir);
  let reportPath = buildReportPath(reportDir);

  try {
    // Ensure report directory exists
    await ensureDirectory({ path: reportDir, deps: { mkdir } });

    // Check if bundles exist
    let bundleCheck = checkBundlesExist({ projectRoot, deps: { existsSync } });
    let bundleValidation = validateBundlesExist(
      bundleCheck.bundleExists,
      bundleCheck.cssExists
    );

    if (!bundleValidation.valid) {
      throw new Error(bundleValidation.error);
    }

    // Copy bundles to report directory
    await copyBundles({
      bundlePath: bundleCheck.bundlePath,
      cssPath: bundleCheck.cssPath,
      reportDir,
      deps: { copyFile },
    });

    // Generate HTML content
    let htmlContent = buildHtmlContent(reportData, getDate());

    // Write HTML file
    await writeHtmlFile({
      path: reportPath,
      content: htmlContent,
      deps: { writeFile },
    });

    output.debug('report', 'generated static report');
    return reportPath;
  } catch (error) {
    output.error(`Failed to generate static report: ${error.message}`);
    throw new Error(`Report generation failed: ${error.message}`);
  }
}
