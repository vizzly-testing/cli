/**
 * Static Report Generator using React Reporter
 * Generates a self-contained HTML file with the React dashboard and embedded data
 *
 * This class is a thin wrapper around the functional report-generator module.
 * For new code, consider using the functions directly from '../report-generator/'.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFallbackHtmlContent,
  buildHtmlContent,
  buildReportDir,
  buildReportPath,
  generateReport,
} from '../report-generator/index.js';
import * as output from '../utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

export class StaticReportGenerator {
  constructor(workingDir, config) {
    this.workingDir = workingDir;
    this.config = config;
    this.reportDir = buildReportDir(workingDir);
    this.reportPath = buildReportPath(this.reportDir);
  }

  /**
   * Generate static HTML report with React reporter bundle
   * @param {Object} reportData - Complete report data (same format as live dashboard)
   * @returns {Promise<string>} Path to generated report
   */
  async generateReport(reportData) {
    return generateReport({
      reportData,
      workingDir: this.workingDir,
      projectRoot: PROJECT_ROOT,
      deps: {
        mkdir,
        existsSync,
        copyFile,
        writeFile,
        output,
        getDate: () => new Date(),
      },
    });
  }

  /**
   * Generate HTML template with embedded React app
   * @param {Object} reportData - Report data to embed
   * @returns {string} HTML content
   * @deprecated Use buildHtmlContent from report-generator/core.js
   */
  generateHtmlTemplate(reportData) {
    return buildHtmlContent(reportData, new Date());
  }

  /**
   * Generate a minimal HTML report when bundles are missing (fallback)
   * @param {Object} reportData - Report data
   * @returns {string} Minimal HTML content
   */
  generateFallbackHtml(reportData) {
    return buildFallbackHtmlContent(reportData, new Date());
  }
}
