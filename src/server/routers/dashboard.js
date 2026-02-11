/**
 * Dashboard Router
 * Serves the React SPA for all dashboard routes
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as output from '../../utils/output.js';
import { sendError, sendHtml, sendSuccess } from '../middleware/response.js';

// SPA routes that should serve the dashboard HTML
const SPA_ROUTES = ['/', '/stats', '/settings', '/projects', '/builds'];

/**
 * Create dashboard router
 * @param {Object} context - Router context
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createDashboardRouter(context) {
  const { workingDir = process.cwd() } = context || {};

  /**
   * Read baseline metadata from baselines/metadata.json
   */
  const readBaselineMetadata = () => {
    const metadataPath = join(
      workingDir,
      '.vizzly',
      'baselines',
      'metadata.json'
    );
    if (!existsSync(metadataPath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(metadataPath, 'utf8'));
    } catch {
      return null;
    }
  };

  return async function handleDashboardRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    // API endpoint for fetching report data
    if (pathname === '/api/report-data') {
      const reportDataPath = join(workingDir, '.vizzly', 'report-data.json');

      if (existsSync(reportDataPath)) {
        try {
          const data = JSON.parse(readFileSync(reportDataPath, 'utf8'));
          // Include baseline metadata for stats view
          data.baseline = readBaselineMetadata();
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(data));
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

    // API endpoint for fetching full comparison details (lightweight + heavy fields)
    let comparisonMatch = pathname.match(/^\/api\/comparison\/(.+)$/);
    if (comparisonMatch) {
      let comparisonId = decodeURIComponent(comparisonMatch[1]);
      if (!comparisonId) {
        sendError(res, 400, 'Comparison ID is required');
        return true;
      }

      let reportDataPath = join(workingDir, '.vizzly', 'report-data.json');
      if (!existsSync(reportDataPath)) {
        sendError(res, 404, 'No report data found');
        return true;
      }

      try {
        let reportData = JSON.parse(readFileSync(reportDataPath, 'utf8'));
        let comparison = (reportData.comparisons || []).find(
          c =>
            c.id === comparisonId ||
            c.signature === comparisonId ||
            c.name === comparisonId
        );

        if (!comparison) {
          sendError(res, 404, 'Comparison not found');
          return true;
        }

        // Merge with heavy fields from comparison-details.json
        let detailsPath = join(
          workingDir,
          '.vizzly',
          'comparison-details.json'
        );
        if (existsSync(detailsPath)) {
          try {
            let details = JSON.parse(readFileSync(detailsPath, 'utf8'));
            let heavy = details[comparison.id];
            if (heavy) {
              comparison = { ...comparison, ...heavy };
            }
          } catch (error) {
            output.debug('Failed to read comparison details:', {
              error: error.message,
            });
          }
        }

        sendSuccess(res, comparison);
      } catch (error) {
        output.debug('Error reading comparison data:', {
          error: error.message,
        });
        sendError(res, 500, 'Failed to read comparison data');
      }
      return true;
    }

    // Serve React SPA for dashboard routes
    if (SPA_ROUTES.includes(pathname) || pathname.startsWith('/comparison/')) {
      const reportDataPath = join(workingDir, '.vizzly', 'report-data.json');
      let reportData = null;

      if (existsSync(reportDataPath)) {
        try {
          const data = readFileSync(reportDataPath, 'utf8');
          reportData = JSON.parse(data);
          // Include baseline metadata for stats view
          reportData.baseline = readBaselineMetadata();
        } catch (error) {
          output.debug('Could not read report data:', { error: error.message });
        }
      }

      const dashboardHtml = `
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
