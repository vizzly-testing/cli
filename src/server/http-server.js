import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServiceLogger } from '../utils/logger-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const logger = createServiceLogger('HTTP-SERVER');

export const createHttpServer = (port, screenshotHandler) => {
  let server = null;

  const parseRequestBody = req => {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });

      req.on('error', reject);
    });
  };

  const handleRequest = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    // Parse URL to handle query params properly for all routes
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      // Enhanced health endpoint with diagnostics
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

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'ok',
          port: port,
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
        })
      );
      return;
    }

    // Serve the main React app for all non-API routes
    if (
      req.method === 'GET' &&
      (parsedUrl.pathname === '/' ||
        parsedUrl.pathname === '/dashboard' ||
        parsedUrl.pathname === '/stats')
    ) {
      // Serve React-powered dashboard
      const reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');

      // Try to read existing report data
      let reportData = null;
      if (existsSync(reportDataPath)) {
        try {
          const data = readFileSync(reportDataPath, 'utf8');
          reportData = JSON.parse(data);
        } catch (error) {
          logger.debug('Could not read report data:', error.message);
        }
      }

      const dashboardHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Vizzly TDD Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/reporter-bundle.css">
</head>
<body>
    <div id="vizzly-reporter-root">
        <div class="reporter-loading">
            <div>
                <div class="spinner"></div>
                <p>Loading Vizzly TDD Dashboard...</p>
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

      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(dashboardHtml);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/reporter-bundle.js') {
      // Serve the React bundle
      const bundlePath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.iife.js'
      );
      if (existsSync(bundlePath)) {
        try {
          const bundle = readFileSync(bundlePath, 'utf8');
          res.setHeader('Content-Type', 'application/javascript');
          res.statusCode = 200;
          res.end(bundle);
        } catch (error) {
          logger.error('Error serving reporter bundle:', error);
          res.statusCode = 500;
          res.end('Error loading reporter bundle');
        }
      } else {
        res.statusCode = 404;
        res.end('Reporter bundle not found');
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/reporter-bundle.css') {
      // Serve the React CSS bundle
      const cssPath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.css'
      );
      if (existsSync(cssPath)) {
        try {
          const css = readFileSync(cssPath, 'utf8');
          res.setHeader('Content-Type', 'text/css');
          res.statusCode = 200;
          res.end(css);
        } catch (error) {
          logger.error('Error serving reporter CSS:', error);
          res.statusCode = 500;
          res.end('Error loading reporter CSS');
        }
      } else {
        res.statusCode = 404;
        res.end('Reporter CSS not found');
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/report-data') {
      // API endpoint for fetching report data
      const reportDataPath = join(process.cwd(), '.vizzly', 'report-data.json');
      if (existsSync(reportDataPath)) {
        try {
          const data = readFileSync(reportDataPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(data);
        } catch (error) {
          logger.error('Error reading report data:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to read report data' }));
        }
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify(null)); // No data available yet
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/status') {
      // Real-time status endpoint
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

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          timestamp: Date.now(),
          baseline: baselineInfo,
          comparisons: reportData?.comparisons || [],
          summary: reportData?.summary || {
            total: 0,
            passed: 0,
            failed: 0,
            errors: 0,
          },
        })
      );
      return;
    }

    if (
      req.method === 'POST' &&
      parsedUrl.pathname === '/api/baseline/accept'
    ) {
      // Accept a single screenshot as baseline
      if (!screenshotHandler?.acceptBaseline) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Baseline management not available' }));
        return;
      }

      try {
        const { id } = await parseRequestBody(req);
        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Comparison ID required' }));
          return;
        }

        await screenshotHandler.acceptBaseline(id);

        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            message: `Baseline accepted for comparison ${id}`,
          })
        );
      } catch (error) {
        logger.error('Error accepting baseline:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (
      req.method === 'POST' &&
      parsedUrl.pathname === '/api/baseline/accept-all'
    ) {
      // Accept all screenshots as baseline
      if (!screenshotHandler?.acceptAllBaselines) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Baseline management not available' }));
        return;
      }

      try {
        const result = await screenshotHandler.acceptAllBaselines();

        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            message: `Accepted ${result.count} baselines`,
            count: result.count,
          })
        );
      } catch (error) {
        logger.error('Error accepting all baselines:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/baseline/reset') {
      // Reset baselines to previous state
      if (!screenshotHandler?.resetBaselines) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Baseline management not available' }));
        return;
      }

      try {
        await screenshotHandler.resetBaselines();

        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            message: 'Baselines reset to previous state',
          })
        );
      } catch (error) {
        logger.error('Error resetting baselines:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Serve images from .vizzly directory
    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/images/')) {
      const imagePath = parsedUrl.pathname.replace('/images/', '');
      const fullImagePath = join(process.cwd(), '.vizzly', imagePath);

      if (existsSync(fullImagePath)) {
        try {
          const imageData = readFileSync(fullImagePath);
          res.setHeader('Content-Type', 'image/png');
          res.statusCode = 200;
          res.end(imageData);
        } catch (error) {
          logger.error('Error serving image:', error);
          res.statusCode = 500;
          res.end('Error loading image');
        }
      } else {
        res.statusCode = 404;
        res.end('Image not found');
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/screenshot') {
      try {
        const body = await parseRequestBody(req);
        const { buildId, name, properties, image } = body;

        if (!name || !image) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'name and image are required' }));
          return;
        }

        // Use default buildId if none provided
        const effectiveBuildId = buildId || 'default';

        const result = await screenshotHandler.handleScreenshot(
          effectiveBuildId,
          name,
          image,
          properties
        );

        res.statusCode = result.statusCode;
        res.end(JSON.stringify(result.body));
      } catch (error) {
        logger.error('Screenshot processing error:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to process screenshot' }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/accept-baseline') {
      try {
        const body = await parseRequestBody(req);
        const { id } = body;

        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'comparison ID is required' }));
          return;
        }

        // Call the screenshot handler's accept baseline method if it exists
        if (screenshotHandler.acceptBaseline) {
          const result = await screenshotHandler.acceptBaseline(id);
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, ...result }));
        } else {
          res.statusCode = 501;
          res.end(JSON.stringify({ error: 'Accept baseline not implemented' }));
        }
      } catch (error) {
        logger.error('Accept baseline error:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to accept baseline' }));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  };

  const start = () => {
    return new Promise((resolve, reject) => {
      server = createServer(async (req, res) => {
        try {
          await handleRequest(req, res);
        } catch (error) {
          logger.error('Server error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      server.listen(port, '127.0.0.1', error => {
        if (error) {
          reject(error);
        } else {
          logger.debug(`HTTP server listening on http://127.0.0.1:${port}`);
          resolve();
        }
      });

      server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${port} is already in use. Try a different port with --port.`
            )
          );
        } else {
          reject(error);
        }
      });
    });
  };

  const stop = () => {
    if (server) {
      return new Promise(resolve => {
        server.close(() => {
          server = null;
          logger.debug('HTTP server stopped');
          resolve();
        });
      });
    }
    return Promise.resolve();
  };

  /**
   * Finish build - flush any pending background operations
   * Call this before finalizing a build to ensure all uploads complete
   */
  const finishBuild = async buildId => {
    logger.debug(`Finishing build ${buildId}...`);

    // Flush screenshot handler if it has a flush method (API mode)
    if (screenshotHandler?.flush) {
      const stats = await screenshotHandler.flush();
      logger.debug(
        `Build ${buildId} uploads complete: ${stats.uploaded} uploaded, ${stats.failed} failed`
      );
      return stats;
    }

    logger.debug(`Build ${buildId} finished (no flush needed)`);
    return null;
  };

  return {
    start,
    stop,
    finishBuild,
    getServer: () => server,
  };
};
