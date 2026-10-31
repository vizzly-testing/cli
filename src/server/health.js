/**
 * Health Router
 * Health check endpoint with diagnostics
 */

import { createReportStore } from '../domains/reports/report-store.js';
import { sendSuccess } from './middleware/response.js';

/**
 * Create health router
 * @param {Object} context - Router context
 * @param {number} context.port - Server port
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {string} [context.workingDir] - Workspace containing report artifacts
 * @returns {Function} Route handler
 */
export function createHealthRouter({
  port,
  screenshotHandler,
  workingDir = process.cwd(),
}) {
  let reports = createReportStore(workingDir);
  return async function handleHealthRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/health') {
      return false;
    }

    let reportData = null;
    try {
      reportData = reports.readReport();
    } catch {
      // Health remains available when report artifacts cannot be read.
    }
    let baselineInfo = reports.readBaselineMetadata();

    sendSuccess(res, {
      status: 'ok',
      port,
      uptime: process.uptime(),
      mode: screenshotHandler ? 'tdd' : 'upload',
      baseline: baselineInfo
        ? {
            buildName: baselineInfo.buildName,
            createdAt: baselineInfo.createdAt,
          }
        : null,
      stats: reportData
        ? {
            total: reportData.summary?.total || 0,
            passed: reportData.summary?.passed || 0,
            failed: reportData.summary?.failed || 0,
            errors: reportData.summary?.errors || 0,
          }
        : null,
    });

    return true;
  };
}
