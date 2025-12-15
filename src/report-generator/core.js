/**
 * Report Generator Core - Pure functions for report generation
 *
 * No I/O, no side effects - just data transformations.
 */

import { join } from 'node:path';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_REPORT_DIR_NAME = 'report';
export const BUNDLE_FILENAME = 'reporter-bundle.js';
export const CSS_FILENAME = 'reporter-bundle.css';
export const INDEX_FILENAME = 'index.html';

// ============================================================================
// Path Building
// ============================================================================

/**
 * Build report directory path
 * @param {string} workingDir - Working directory
 * @returns {string} Report directory path
 */
export function buildReportDir(workingDir) {
  return join(workingDir, '.vizzly', DEFAULT_REPORT_DIR_NAME);
}

/**
 * Build report HTML path
 * @param {string} reportDir - Report directory
 * @returns {string} Report HTML path
 */
export function buildReportPath(reportDir) {
  return join(reportDir, INDEX_FILENAME);
}

/**
 * Build bundle source paths
 * @param {string} projectRoot - Project root directory
 * @returns {{ bundlePath: string, cssPath: string }}
 */
export function buildBundleSourcePaths(projectRoot) {
  return {
    bundlePath: join(
      projectRoot,
      'dist',
      'reporter',
      'reporter-bundle.iife.js'
    ),
    cssPath: join(projectRoot, 'dist', 'reporter', 'reporter-bundle.css'),
  };
}

/**
 * Build bundle destination paths
 * @param {string} reportDir - Report directory
 * @returns {{ bundleDest: string, cssDest: string }}
 */
export function buildBundleDestPaths(reportDir) {
  return {
    bundleDest: join(reportDir, BUNDLE_FILENAME),
    cssDest: join(reportDir, CSS_FILENAME),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate report data
 * @param {any} reportData - Report data to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateReportData(reportData) {
  if (!reportData || typeof reportData !== 'object') {
    return { valid: false, error: 'Invalid report data provided' };
  }
  return { valid: true, error: null };
}

/**
 * Check if bundles exist
 * @param {boolean} bundleExists - Whether bundle JS exists
 * @param {boolean} cssExists - Whether bundle CSS exists
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBundlesExist(bundleExists, cssExists) {
  if (!bundleExists || !cssExists) {
    return {
      valid: false,
      error: 'Reporter bundles not found. Run "npm run build:reporter" first.',
    };
  }
  return { valid: true, error: null };
}

// ============================================================================
// Data Serialization
// ============================================================================

/**
 * Safely serialize data for embedding in HTML script tag
 * Escapes characters that could break out of script context
 * @param {Object} data - Data to serialize
 * @returns {string} Safely serialized JSON string
 */
export function serializeForHtml(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// ============================================================================
// HTML Template Generation
// ============================================================================

/**
 * Generate the main HTML template with React reporter
 * @param {Object} options - Template options
 * @param {string} options.serializedData - Serialized report data
 * @param {string} options.timestamp - ISO timestamp string
 * @param {string} options.displayDate - Human-readable date string
 * @returns {string} HTML content
 */
export function generateMainTemplate({
  serializedData,
  timestamp,
  displayDate,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vizzly Dev Report - ${displayDate}</title>
    <link rel="stylesheet" href="./reporter-bundle.css">
    <style>
        /* Loading spinner styles */
        .reporter-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #0f172a;
            color: #f59e0b;
        }
        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(245, 158, 11, 0.2);
            border-top-color: #f59e0b;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 1rem;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="vizzly-reporter-root">
        <div class="reporter-loading">
            <div style="text-align: center;">
                <div class="spinner"></div>
                <p>Loading Vizzly Report...</p>
            </div>
        </div>
    </div>

    <script>
        // Embedded report data (static mode)
        window.VIZZLY_REPORTER_DATA = ${serializedData};
        window.VIZZLY_STATIC_MODE = true;

        // Generate timestamp for "generated at" display
        window.VIZZLY_REPORT_GENERATED_AT = "${timestamp}";

        console.log('Vizzly Static Report loaded');
        console.log('Report data:', window.VIZZLY_REPORTER_DATA?.summary);
    </script>
    <script src="./reporter-bundle.js"></script>
</body>
</html>`;
}

/**
 * Generate fallback HTML template (when bundles are missing)
 * @param {Object} options - Template options
 * @param {Object} options.summary - Report summary
 * @param {Array} options.comparisons - Comparison results
 * @param {string} options.displayDate - Human-readable date string
 * @returns {string} HTML content
 */
export function generateFallbackTemplate({
  summary,
  comparisons,
  displayDate,
}) {
  let failed = comparisons.filter(c => c.status === 'failed');

  let failedSection =
    failed.length > 0
      ? `
            <h2>Failed Comparisons</h2>
            <ul>
                ${failed.map(c => `<li>${c.name} - ${c.diffPercentage || 0}% difference</li>`).join('')}
            </ul>
        `
      : '<p style="text-align: center; font-size: 1.5rem; color: #10b981;">All tests passed!</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vizzly Dev Report</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 2rem;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 2rem; }
        .summary {
            display: flex;
            gap: 2rem;
            justify-content: center;
            margin: 2rem 0;
        }
        .stat { text-align: center; }
        .stat-number {
            font-size: 3rem;
            font-weight: bold;
            display: block;
        }
        .warning {
            background: #fef3c7;
            color: #92400e;
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 2rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐻 Vizzly Dev Report</h1>
            <p>Generated: ${displayDate}</p>
        </div>

        <div class="summary">
            <div class="stat">
                <span class="stat-number">${summary.total || 0}</span>
                <span>Total</span>
            </div>
            <div class="stat">
                <span class="stat-number" style="color: #10b981;">${summary.passed || 0}</span>
                <span>Passed</span>
            </div>
            <div class="stat">
                <span class="stat-number" style="color: #ef4444;">${summary.failed || 0}</span>
                <span>Failed</span>
            </div>
        </div>

        <div class="warning">
            <strong>Limited Report</strong>
            <p>This is a fallback report. For the full interactive experience, ensure the reporter bundle is built:</p>
            <code>npm run build:reporter</code>
        </div>

        ${failedSection}
    </div>
</body>
</html>`;
}

/**
 * Build HTML content for the report
 * @param {Object} reportData - Report data
 * @param {Date} date - Current date
 * @returns {string} HTML content
 */
export function buildHtmlContent(reportData, date) {
  let serializedData = serializeForHtml(reportData);
  let timestamp = date.toISOString();
  let displayDate = date.toLocaleString();

  return generateMainTemplate({ serializedData, timestamp, displayDate });
}

/**
 * Build fallback HTML content
 * @param {Object} reportData - Report data
 * @param {Date} date - Current date
 * @returns {string} HTML content
 */
export function buildFallbackHtmlContent(reportData, date) {
  let summary = reportData.summary || {};
  let comparisons = reportData.comparisons || [];
  let displayDate = date.toLocaleString();

  return generateFallbackTemplate({ summary, comparisons, displayDate });
}
