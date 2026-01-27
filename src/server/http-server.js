/**
 * HTTP Server
 * Thin dispatcher that routes requests to modular routers
 */

import { createServer } from 'node:http';
import * as output from '../utils/output.js';

// Middleware
import { corsMiddleware } from './middleware/cors.js';
import { sendError } from './middleware/response.js';
import { createAssetsRouter } from './routers/assets.js';
import { createAuthRouter } from './routers/auth.js';
import { createBaselineRouter } from './routers/baseline.js';
import { createCloudProxyRouter } from './routers/cloud-proxy.js';
import { createConfigRouter } from './routers/config.js';
import { createDashboardRouter } from './routers/dashboard.js';
import { createEventsRouter } from './routers/events.js';
// Routers
import { createHealthRouter } from './routers/health.js';
import { createProjectsRouter } from './routers/projects.js';
import { createRegionsRouter } from './routers/regions.js';
import { createScreenshotRouter } from './routers/screenshot.js';

export const createHttpServer = (port, screenshotHandler, services = {}) => {
  let server = null;
  const defaultBuildId = services.buildId || null;

  // Extract services
  const { configService, authService, projectService, tddService, workingDir } =
    services;

  // Create router context
  const routerContext = {
    port,
    screenshotHandler,
    defaultBuildId,
    configService,
    authService,
    projectService,
    tddService,
    workingDir: workingDir || process.cwd(),
    apiUrl: 'https://app.vizzly.dev',
  };

  // Initialize routers
  const routers = [
    createHealthRouter(routerContext),
    createAssetsRouter(routerContext),
    createScreenshotRouter(routerContext),
    createBaselineRouter(routerContext),
    createConfigRouter(routerContext),
    createAuthRouter(routerContext),
    createProjectsRouter(routerContext),
    createCloudProxyRouter(routerContext),
    createRegionsRouter(routerContext),
    createEventsRouter(routerContext), // SSE for real-time updates
    createDashboardRouter(routerContext), // Catch-all for SPA routes - must be last
  ];

  const handleRequest = async (req, res) => {
    // Apply CORS middleware
    if (corsMiddleware(req, res)) {
      return;
    }

    // Set default JSON content type
    res.setHeader('Content-Type', 'application/json');

    // Parse URL
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Try each router in order
    for (const router of routers) {
      try {
        const handled = await router(req, res, pathname, parsedUrl);
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

  const start = () => {
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
          // Don't log here - let the caller handle success logging via onServerReady callback
          // This prevents duplicate "listening on" messages
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
        // Close all keep-alive connections immediately (Node 18.2+)
        if (server.closeAllConnections) {
          server.closeAllConnections();
        }
        server.close(() => {
          server = null;
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
  const finishBuild = async _buildId => {
    // Flush screenshot handler if it has a flush method (API mode)
    if (screenshotHandler?.flush) {
      const stats = await screenshotHandler.flush();
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
