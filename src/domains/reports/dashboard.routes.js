/** Dashboard HTTP projections and the reporter application shell. */
import {
  sendError,
  sendHtml,
  sendSuccess,
} from '../../server/middleware/response.js';
import * as output from '../../services/output.js';
import { presentComparisonDetails } from './report.serializers.js';
import { createReportStore } from './report-store.js';

let SPA_ROUTES = ['/', '/stats', '/settings', '/projects', '/builds'];

export function createDashboardRouter(context) {
  let { workingDir = process.cwd() } = context || {};
  let reports = createReportStore(workingDir);
  return async function handleDashboardRoute(req, res, pathname) {
    if (req.method !== 'GET') return false;

    if (pathname === '/api/report-data') {
      try {
        sendSuccess(res, reports.readSnapshot());
      } catch (error) {
        output.debug('Error reading report data:', { error: error.message });
        sendError(res, 500, 'Failed to read report data');
      }
      return true;
    }

    let comparisonMatch = pathname.match(/^\/api\/comparison\/(.+)$/);
    if (comparisonMatch) {
      let comparisonId = decodeURIComponent(comparisonMatch[1]);
      if (!comparisonId) {
        sendError(res, 400, 'Comparison ID is required');
        return true;
      }
      try {
        let reportData = reports.readReport();
        if (!reportData) {
          sendError(res, 404, 'No report data found');
          return true;
        }
        let comparison = (reportData.comparisons || []).find(
          candidate =>
            candidate.id === comparisonId ||
            candidate.signature === comparisonId ||
            candidate.name === comparisonId
        );
        if (!comparison) {
          sendError(res, 404, 'Comparison not found');
          return true;
        }
        let heavy = reports.readDetails()[comparison.id];
        sendSuccess(
          res,
          heavy
            ? { ...comparison, ...presentComparisonDetails(heavy) }
            : comparison
        );
      } catch (error) {
        output.debug('Error reading comparison data:', {
          error: error.message,
        });
        sendError(res, 500, 'Failed to read comparison data');
      }
      return true;
    }

    if (SPA_ROUTES.includes(pathname) || pathname.startsWith('/comparison/')) {
      let reportData = null;
      try {
        reportData = reports.readSnapshot();
      } catch (error) {
        output.debug('Could not read report data:', { error: error.message });
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
