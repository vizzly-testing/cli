/**
 * Dashboard Router
 * Serves the React SPA for all dashboard routes
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { sendHtml, sendSuccess } from '../middleware/response.js';
import * as output from '../../utils/output.js';

// SPA routes that should serve the dashboard HTML
let SPA_ROUTES = [
  '/',
  '/dashboard',
  '/stats',
  '/settings',
  '/projects',
  '/builds',
];

/**
 * Create dashboard router
 * @param {Object} context - Router context
 * @returns {Function} Route handler
 */
export function createDashboardRouter() {
  return async function handleDashboardRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    // API endpoint for fetching report data
    if (pathname === '/api/report-data') {
      let reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');

      if (existsSync(reportDataPath)) {
        try {
          let data = readFileSync(reportDataPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(data);
          return true;
        } catch (error) {
          output.debug('Error reading report data:', { error: error.message });
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to read report data' }));
          return true;
        }
      } else {
        sendSuccess(res, null);
        return true;
      }
    }

    // API endpoint for real-time status
    if (pathname === '/api/status') {
      let reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');
      let baselineMetadataPath = join(
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
          // Ignore
        }
      }

      if (existsSync(baselineMetadataPath)) {
        try {
          baselineInfo = JSON.parse(readFileSync(baselineMetadataPath, 'utf8'));
        } catch {
          // Ignore
        }
      }

      sendSuccess(res, {
        timestamp: Date.now(),
        baseline: baselineInfo,
        comparisons: reportData?.comparisons || [],
        summary: reportData?.summary || {
          total: 0,
          passed: 0,
          failed: 0,
          errors: 0,
        },
      });
      return true;
    }

    // Serve React SPA for dashboard routes
    if (SPA_ROUTES.includes(pathname) || pathname.startsWith('/comparison/')) {
      let reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');
      let reportData = null;

      if (existsSync(reportDataPath)) {
        try {
          let data = readFileSync(reportDataPath, 'utf8');
          reportData = JSON.parse(data);
        } catch (error) {
          output.debug('Could not read report data:', { error: error.message });
        }
      }

      let dashboardHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Vizzly Dev Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/reporter-bundle.css">
</head>
<body>
    <div id="vizzly-reporter-root">
        <div class="reporter-loading">
            <div>
                <div class="spinner"></div>
                <p>Loading Vizzly Dev Dashboard...</p>
            </div>
        </div>
    </div>

    <script>
        // Inject report data if available
        ${reportData ? `window.VIZZLY_REPORTER_DATA = ${JSON.stringify(reportData)};` : ''}
    </script>
    <script src="/reporter-bundle.js"></script>
</body>
</html>`;

      sendHtml(res, 200, dashboardHtml);
      return true;
    }

    return false;
  };
}
