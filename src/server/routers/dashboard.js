/**
 * Dashboard Router
 * Serves the React SPA for all dashboard routes
 */

import { createStateStore } from '../../tdd/state-store.js';
import * as output from '../../utils/output.js';
import { sendError, sendHtml, sendSuccess } from '../middleware/response.js';

// SPA routes that should serve the dashboard HTML
let SPA_ROUTES = ['/', '/stats', '/settings', '/projects', '/builds'];

/**
 * Create dashboard router
 * @param {Object} context - Router context
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createDashboardRouter(context) {
  let { workingDir = process.cwd() } = context || {};

  return async function handleDashboardRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    // API endpoint for fetching report data
    if (pathname === '/api/report-data') {
      let stateStore = createStateStore({ workingDir, output });
      try {
        let data = stateStore.readReportData();
        if (!data) {
          sendSuccess(res, null);
          return true;
        }

        data.baseline = stateStore.getBaselineMetadata();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(data));
        return true;
      } catch (error) {
        output.debug('Error reading report data:', { error: error.message });
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to read report data' }));
        return true;
      } finally {
        stateStore.close();
      }
    }

    // API endpoint for fetching full comparison details (lightweight + heavy fields)
    let comparisonMatch = pathname.match(/^\/api\/comparison\/(.+)$/);
    if (comparisonMatch) {
      let comparisonId = decodeURIComponent(comparisonMatch[1]);
      if (!comparisonId) {
        sendError(res, 400, 'Comparison ID is required');
        return true;
      }

      let stateStore = createStateStore({ workingDir, output });
      try {
        let reportData = stateStore.readReportData();
        if (!reportData) {
          sendError(res, 404, 'No report data found');
          return true;
        }

        let comparison =
          stateStore.getComparisonByIdOrSignatureOrName(comparisonId);
        if (!comparison) {
          sendError(res, 404, 'Comparison not found');
          return true;
        }

        let heavy = stateStore.getComparisonDetails(comparison.id);
        if (heavy) {
          comparison = { ...comparison, ...heavy };
        }

        sendSuccess(res, comparison);
      } catch (error) {
        output.debug('Error reading comparison data:', {
          error: error.message,
        });
        sendError(res, 500, 'Failed to read comparison data');
      } finally {
        stateStore.close();
      }
      return true;
    }

    // Serve React SPA for dashboard routes
    if (SPA_ROUTES.includes(pathname) || pathname.startsWith('/comparison/')) {
      let reportData = null;

      let stateStore = createStateStore({ workingDir, output });
      try {
        reportData = stateStore.readReportData();
        if (reportData) {
          reportData.baseline = stateStore.getBaselineMetadata();
        }
      } catch (error) {
        output.debug('Could not read report data:', { error: error.message });
      } finally {
        stateStore.close();
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
