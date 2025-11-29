/**
 * HTTP Server
 * Thin dispatcher that routes requests to modular routers
 */

import { createServer } from 'http';
import * as output from '../utils/output.js';

// Middleware
import { corsMiddleware } from './middleware/cors.js';
import { sendError } from './middleware/response.js';

// Routers
import { createHealthRouter } from './routers/health.js';
import { createAssetsRouter } from './routers/assets.js';
import { createDashboardRouter } from './routers/dashboard.js';
import { createScreenshotRouter } from './routers/screenshot.js';
import { createBaselineRouter } from './routers/baseline.js';
import { createConfigRouter } from './routers/config.js';
import { createAuthRouter } from './routers/auth.js';
import { createProjectsRouter } from './routers/projects.js';
import { createCloudProxyRouter } from './routers/cloud-proxy.js';

export let createHttpServer = (port, screenshotHandler, services = {}) => {
  let server = null;
  let defaultBuildId = services.buildId || null;

  // Extract services
  let { configService, authService, projectService, tddService } = services;

  // Create router context
  let routerContext = {
    port,
    screenshotHandler,
    defaultBuildId,
    configService,
    authService,
    projectService,
    tddService,
    apiUrl: 'https://app.vizzly.dev',
  };

  // Initialize routers
  let routers = [
    createHealthRouter(routerContext),
    createAssetsRouter(routerContext),
    createScreenshotRouter(routerContext),
    createBaselineRouter(routerContext),
    createConfigRouter(routerContext),
    createAuthRouter(routerContext),
    createProjectsRouter(routerContext),
    createCloudProxyRouter(routerContext),
    createDashboardRouter(routerContext), // Catch-all for SPA routes - must be last
  ];

  let handleRequest = async (req, res) => {
    // Apply CORS middleware
    if (corsMiddleware(req, res)) {
      return;
    }

    // Set default JSON content type
    res.setHeader('Content-Type', 'application/json');

    // Parse URL
    let parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = parsedUrl.pathname;

    // Try each router in order
    for (let router of routers) {
      try {
        let handled = await router(req, res, pathname, parsedUrl);
        if (handled) {
          return;
        }
      } catch (error) {
        output.debug('server', `router error: ${pathname}`, {
          error: error.message,
        });
        sendError(res, 500, 'Internal server error');
        return;
      }
    }

    // No router handled the request
    sendError(res, 404, 'Not found');
  };

  let start = () => {
    return new Promise((resolve, reject) => {
      server = createServer(async (req, res) => {
        try {
          await handleRequest(req, res);
        } catch (error) {
          output.debug('server', 'error', { error: error.message });
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      server.listen(port, '127.0.0.1', error => {
        if (error) {
          reject(error);
        } else {
          output.debug('server', `listening on :${port}`);
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

  let stop = () => {
    if (server) {
      return new Promise(resolve => {
        server.close(() => {
          server = null;
          output.debug('server', 'stopped');
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
  let finishBuild = async _buildId => {
    // Flush screenshot handler if it has a flush method (API mode)
    if (screenshotHandler?.flush) {
      let stats = await screenshotHandler.flush();
      if (stats.uploaded > 0 || stats.failed > 0) {
        output.debug('upload', 'flushed', {
          uploaded: stats.uploaded,
          failed: stats.failed,
        });
      }
      return stats;
    }

    return null;
  };

  return {
    start,
    stop,
    finishBuild,
    getServer: () => server,
  };
};
