/**
 * Health Router
 * Health check endpoint with diagnostics
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sendSuccess } from '../middleware/response.js';

/**
 * Create health router
 * @param {Object} context - Router context
 * @param {number} context.port - Server port
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @returns {Function} Route handler
 */
export function createHealthRouter({ port, screenshotHandler }) {
  return async function handleHealthRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/health') {
      return false;
    }

    const reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');
    const baselineMetadataPath = join(
      process.cwd(),
      '.vizzly',
      'baselines',
      'metadata.json'
    );

    let reportData = null;
    let baselineInfo = null;

    if (existsSync(reportDataPath)) {
      try {
        reportData = JSON.parse(readFileSync(reportDataPath, 'utf8'));
      } catch {
        // Ignore read errors
      }
    }

    if (existsSync(baselineMetadataPath)) {
      try {
        baselineInfo = JSON.parse(readFileSync(baselineMetadataPath, 'utf8'));
      } catch {
        // Ignore read errors
      }
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
