import { createServer } from 'http';
import { createServiceLogger } from '../utils/logger-factory.js';

const logger = createServiceLogger('HTTP-SERVER');

export const createHttpServer = (port, screenshotHandler, emitter = null) => {
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

    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'ok',
          port: port,
          uptime: process.uptime(),
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/screenshot') {
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

        // Emit screenshot captured event if emitter is available
        if (emitter && result.statusCode === 200) {
          emitter.emit('screenshot-captured', {
            name,
            count: screenshotHandler.getScreenshotCount?.(buildId) || 0,
            skipped: result.body?.skipped,
          });
        }

        res.statusCode = result.statusCode;
        res.end(JSON.stringify(result.body));
      } catch (error) {
        logger.error('Screenshot processing error:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to process screenshot' }));
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

  return {
    start,
    stop,
    getServer: () => server,
  };
};
