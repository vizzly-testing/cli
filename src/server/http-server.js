import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServiceLogger } from '../utils/logger-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const logger = createServiceLogger('HTTP-SERVER');

export const createHttpServer = (port, screenshotHandler, services = {}) => {
  let server = null;

  // Extract services for config/auth/project management
  let configService = services.configService;
  let authService = services.authService;
  let projectService = services.projectService;

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
        parsedUrl.pathname === '/stats' ||
        parsedUrl.pathname === '/settings' ||
        parsedUrl.pathname === '/projects')
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

    // ===== CONFIG MANAGEMENT ENDPOINTS =====

    if (req.method === 'GET' && parsedUrl.pathname === '/api/config') {
      // Get merged config with sources
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const configData = await configService.getConfig('merged');
        res.statusCode = 200;
        res.end(JSON.stringify(configData));
      } catch (error) {
        logger.error('Error fetching config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/config/project') {
      // Get project-level config
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const configData = await configService.getConfig('project');
        res.statusCode = 200;
        res.end(JSON.stringify(configData));
      } catch (error) {
        logger.error('Error fetching project config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/config/global') {
      // Get global config
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const configData = await configService.getConfig('global');
        res.statusCode = 200;
        res.end(JSON.stringify(configData));
      } catch (error) {
        logger.error('Error fetching global config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/config/project') {
      // Update project config
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const body = await parseRequestBody(req);
        const result = await configService.updateConfig('project', body);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (error) {
        logger.error('Error updating project config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/config/global') {
      // Update global config
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const body = await parseRequestBody(req);
        const result = await configService.updateConfig('global', body);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (error) {
        logger.error('Error updating global config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/config/validate') {
      // Validate config
      if (!configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Config service not available' }));
        return;
      }

      try {
        const body = await parseRequestBody(req);
        const result = await configService.validateConfig(body);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
      } catch (error) {
        logger.error('Error validating config:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // ===== AUTH ENDPOINTS =====

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/status') {
      // Get auth status and user info
      if (!authService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Auth service not available' }));
        return;
      }

      try {
        const isAuthenticated = await authService.isAuthenticated();
        let user = null;

        if (isAuthenticated) {
          const whoami = await authService.whoami();
          user = whoami.user;
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: isAuthenticated, user }));
      } catch (error) {
        logger.error('Error getting auth status:', error);
        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: false, user: null }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/login') {
      // Initiate device flow login
      if (!authService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Auth service not available' }));
        return;
      }

      try {
        const deviceFlow = await authService.initiateDeviceFlow();

        // Transform snake_case to camelCase for frontend
        const response = {
          deviceCode: deviceFlow.device_code,
          userCode: deviceFlow.user_code,
          verificationUri: deviceFlow.verification_uri,
          verificationUriComplete: deviceFlow.verification_uri_complete,
          expiresIn: deviceFlow.expires_in,
          interval: deviceFlow.interval,
        };

        res.statusCode = 200;
        res.end(JSON.stringify(response));
      } catch (error) {
        logger.error('Error initiating device flow:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/poll') {
      // Poll device authorization status
      if (!authService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Auth service not available' }));
        return;
      }

      try {
        const body = await parseRequestBody(req);
        const { deviceCode } = body;

        if (!deviceCode) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'deviceCode is required' }));
          return;
        }

        let result;
        try {
          result = await authService.pollDeviceAuthorization(deviceCode);
        } catch (error) {
          // Handle "Authorization pending" as a valid response
          if (error.message && error.message.includes('Authorization pending')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: 'pending' }));
            return;
          }
          // Other errors are actual failures
          throw error;
        }

        // Check if authorization is complete by looking for tokens
        if (result.tokens && result.tokens.accessToken) {
          // Handle both snake_case and camelCase for token data
          let tokensData = result.tokens;
          let tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
          let tokenExpiresAt = tokenExpiresIn
            ? new Date(Date.now() + tokenExpiresIn * 1000).toISOString()
            : result.expires_at || result.expiresAt;

          let tokens = {
            accessToken: tokensData.accessToken || tokensData.access_token,
            refreshToken: tokensData.refreshToken || tokensData.refresh_token,
            expiresAt: tokenExpiresAt,
            user: result.user,
          };

          await authService.completeDeviceFlow(tokens);

          // Return a simplified response to the client
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'complete', user: result.user }));
        } else {
          // Still pending or other status
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'pending' }));
        }
      } catch (error) {
        logger.error('Error polling device authorization:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/logout') {
      // Logout user
      if (!authService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Auth service not available' }));
        return;
      }

      try {
        await authService.logout();
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
      } catch (error) {
        logger.error('Error logging out:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // ===== PROJECT MANAGEMENT ENDPOINTS =====

    if (req.method === 'GET' && parsedUrl.pathname === '/api/projects') {
      // List all projects from API
      if (!projectService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Project service not available' }));
        return;
      }

      try {
        const projects = await projectService.listProjects();
        res.statusCode = 200;
        res.end(JSON.stringify({ projects }));
      } catch (error) {
        logger.error('Error listing projects:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/projects/mappings') {
      // List project directory mappings
      if (!projectService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Project service not available' }));
        return;
      }

      try {
        const mappings = await projectService.listMappings();
        res.statusCode = 200;
        res.end(JSON.stringify({ mappings }));
      } catch (error) {
        logger.error('Error listing project mappings:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/projects/mappings') {
      // Create or update project mapping
      if (!projectService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Project service not available' }));
        return;
      }

      try {
        const body = await parseRequestBody(req);
        const { directory, projectSlug, organizationSlug, token, projectName } = body;

        const mapping = await projectService.createMapping(directory, {
          projectSlug,
          organizationSlug,
          token,
          projectName,
        });

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, mapping }));
      } catch (error) {
        logger.error('Error creating project mapping:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'DELETE' && parsedUrl.pathname.startsWith('/api/projects/mappings/')) {
      // Delete project mapping
      if (!projectService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Project service not available' }));
        return;
      }

      try {
        const directory = decodeURIComponent(parsedUrl.pathname.replace('/api/projects/mappings/', ''));
        await projectService.removeMapping(directory);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Mapping deleted' }));
      } catch (error) {
        logger.error('Error deleting project mapping:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/builds/recent') {
      // Get recent builds for current project
      if (!projectService || !configService) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Required services not available' }));
        return;
      }

      try {
        const config = await configService.getConfig('merged');
        const { projectSlug, organizationSlug } = config.config;

        if (!projectSlug || !organizationSlug) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'No project configured for this directory' }));
          return;
        }

        const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
        const branch = parsedUrl.searchParams.get('branch') || undefined;

        const builds = await projectService.getRecentBuilds(projectSlug, organizationSlug, { limit, branch });

        res.statusCode = 200;
        res.end(JSON.stringify({ builds }));
      } catch (error) {
        logger.error('Error fetching recent builds:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
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
