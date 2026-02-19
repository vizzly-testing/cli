/**
 * Health Router
 * Health check endpoint with diagnostics
 */

import { createStateStore } from '../../tdd/state-store.js';
import { sendSuccess } from '../middleware/response.js';

/**
 * Create health router
 * @param {Object} context - Router context
 * @param {number} context.port - Server port
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createHealthRouter({
  port,
  screenshotHandler,
  workingDir = process.cwd(),
}) {
  return async function handleHealthRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/health') {
      return false;
    }

    let reportData = null;
    let baselineInfo = null;
    let stateStore = createStateStore({ workingDir });
    try {
      reportData = stateStore.readReportData();
      baselineInfo = stateStore.getBaselineMetadata();
    } catch {
      // Ignore read errors
    } finally {
      stateStore.close();
    }

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
