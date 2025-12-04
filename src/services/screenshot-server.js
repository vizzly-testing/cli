/**
 * Screenshot Server Service
 * Listens for and processes screenshots from the test runner
 */

import { createServer } from 'node:http';
import { VizzlyError } from '../errors/vizzly-error.js';
import * as output from '../utils/output.js';

export class ScreenshotServer {
  constructor(config, buildManager) {
    this.config = config;
    this.buildManager = buildManager;
    this.server = null;
  }

  async start() {
    this.server = createServer(this.handleRequest.bind(this));
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.server.port, '127.0.0.1', error => {
        if (error) {
          reject(
            new VizzlyError(
              `Failed to start screenshot server: ${error.message}`,
              'SERVER_ERROR'
            )
          );
        } else {
          output.info(
            `Screenshot server listening on http://127.0.0.1:${this.config.server.port}`
          );
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise(resolve => {
        this.server.close(() => {
          output.info('Screenshot server stopped');
          resolve();
        });
      });
    }
  }

  async handleRequest(req, res) {
    if (req.method === 'POST' && req.url === '/screenshot') {
      try {
        const body = await this.parseRequestBody(req);
        const { buildId, name, image, properties } = body;

        if (!name || !image) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'name and image are required' }));
          return;
        }

        // Use default buildId if none provided
        const effectiveBuildId = buildId || 'default';

        await this.buildManager.addScreenshot(effectiveBuildId, {
          name,
          image,
          properties,
        });

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        output.error('Failed to process screenshot:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  async parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(
            new VizzlyError('Invalid JSON in request body', 'INVALID_JSON')
          );
        }
      });
      req.on('error', error => {
        reject(
          new VizzlyError(`Request error: ${error.message}`, 'REQUEST_ERROR')
        );
      });
    });
  }
}
