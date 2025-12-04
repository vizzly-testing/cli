/**
 * Static Report Generator using React Reporter
 * Generates a self-contained HTML file with the React dashboard and embedded data
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as output from '../utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

export class StaticReportGenerator {
  constructor(workingDir, config) {
    this.workingDir = workingDir;
    this.config = config;
    this.reportDir = join(workingDir, '.vizzly', 'report');
    this.reportPath = join(this.reportDir, 'index.html');
  }

  /**
   * Generate static HTML report with React reporter bundle
   * @param {Object} reportData - Complete report data (same format as live dashboard)
   * @returns {Promise<string>} Path to generated report
   */
  async generateReport(reportData) {
    if (!reportData || typeof reportData !== 'object') {
      throw new Error('Invalid report data provided');
    }

    try {
      // Ensure report directory exists
      await mkdir(this.reportDir, { recursive: true });

      // Copy React bundles to report directory
      const bundlePath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.iife.js'
      );
      const cssPath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.css'
      );

      if (!existsSync(bundlePath) || !existsSync(cssPath)) {
        throw new Error(
          'Reporter bundles not found. Run "npm run build:reporter" first.'
        );
      }

      // Copy bundles to report directory for self-contained report
      await copyFile(bundlePath, join(this.reportDir, 'reporter-bundle.js'));
      await copyFile(cssPath, join(this.reportDir, 'reporter-bundle.css'));

      // Generate HTML with embedded data
      const htmlContent = this.generateHtmlTemplate(reportData);

      await writeFile(this.reportPath, htmlContent, 'utf8');

      output.debug('report', 'generated static report');
      return this.reportPath;
    } catch (error) {
      output.error(`Failed to generate static report: ${error.message}`);
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  /**
   * Generate HTML template with embedded React app
   * @param {Object} reportData - Report data to embed
   * @returns {string} HTML content
   */
  generateHtmlTemplate(reportData) {
    // Serialize report data safely
    const serializedData = JSON.stringify(reportData)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vizzly Dev Report - ${new Date().toLocaleString()}</title>
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
        window.VIZZLY_REPORT_GENERATED_AT = "${new Date().toISOString()}";

        console.log('Vizzly Static Report loaded');
        console.log('Report data:', window.VIZZLY_REPORTER_DATA?.summary);
    </script>
    <script src="./reporter-bundle.js"></script>
</body>
</html>`;
  }

  /**
   * Generate a minimal HTML report when bundles are missing (fallback)
   * @param {Object} reportData - Report data
   * @returns {string} Minimal HTML content
   */
  generateFallbackHtml(reportData) {
    const summary = reportData.summary || {};
    const comparisons = reportData.comparisons || [];
    const failed = comparisons.filter(c => c.status === 'failed');

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
            <p>Generated: ${new Date().toLocaleString()}</p>
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
            <strong>⚠️ Limited Report</strong>
            <p>This is a fallback report. For the full interactive experience, ensure the reporter bundle is built:</p>
            <code>npm run build:reporter</code>
        </div>

        ${
          failed.length > 0
            ? `
            <h2>Failed Comparisons</h2>
            <ul>
                ${failed.map(c => `<li>${c.name} - ${c.diffPercentage || 0}% difference</li>`).join('')}
            </ul>
        `
            : '<p style="text-align: center; font-size: 1.5rem;">✅ All tests passed!</p>'
        }
    </div>
</body>
</html>`;
  }
}
