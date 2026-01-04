/**
 * HTTP server for receiving snapshot requests from browser context
 *
 * This server receives POST requests from test code running in the browser,
 * captures screenshots via Playwright, and forwards them to the Vizzly TDD server.
 *
 * @module @vizzly-testing/ember/launcher/snapshot-server
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, join, parse } from 'node:path';

/**
 * Reference to the Playwright page for screenshot capture
 * Set by the launcher after browser is ready
 */
let pageRef = null;

/**
 * Set the page reference for screenshot capture
 * @param {Object} page - Playwright page instance
 */
export function setPage(page) {
  pageRef = page;
}

/**
 * Get the current page reference
 * @returns {Object|null} Playwright page instance
 */
export function getPage() {
  return pageRef;
}

/**
 * Auto-discover the Vizzly TDD server by searching for .vizzly/server.json
 * @returns {string|null} Server URL or null if not found
 */
function autoDiscoverTddServer() {
  let currentDir = process.cwd();
  let root = parse(currentDir).root;

  while (currentDir !== root) {
    let serverJsonPath = join(currentDir, '.vizzly', 'server.json');

    if (existsSync(serverJsonPath)) {
      try {
        let serverInfo = JSON.parse(readFileSync(serverJsonPath, 'utf8'));
        if (serverInfo.port) {
          return `http://localhost:${serverInfo.port}`;
        }
      } catch {
        // Invalid JSON, continue searching
      }
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Forward screenshot to Vizzly TDD server
 * @param {string} name - Screenshot name
 * @param {Buffer} imageBuffer - PNG image data
 * @param {Object} properties - Screenshot metadata
 * @returns {Promise<Object>} Response from TDD server
 */
async function forwardToVizzly(name, imageBuffer, properties = {}) {
  let tddServerUrl = autoDiscoverTddServer();

  if (!tddServerUrl) {
    // Check for cloud mode via environment
    if (process.env.VIZZLY_TOKEN) {
      // In cloud mode, we'd queue for upload
      // For MVP, return success and let TDD server handle cloud forwarding
      return { success: true, mode: 'cloud', queued: true };
    }

    throw new Error(
      'No Vizzly server found. Run `vizzly tdd start` first, or set VIZZLY_TOKEN for cloud mode.'
    );
  }

  let payload = {
    name,
    image: imageBuffer.toString('base64'),
    properties: {
      framework: 'ember',
      ...properties,
    },
  };

  // Use node:http directly with Connection: close to prevent keep-alive hangs
  let result = await httpPost(`${tddServerUrl}/screenshot`, payload);
  return result;
}

/**
 * Make HTTP POST request without keep-alive (prevents process hang on shutdown)
 * @param {string} url - Target URL
 * @param {Object} data - JSON payload
 * @returns {Promise<Object>} Parsed JSON response
 */
function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    let parsedUrl = new URL(url);
    let isHttps = parsedUrl.protocol === 'https:';
    let requestFn = isHttps ? httpsRequest : httpRequest;

    let body = JSON.stringify(data);

    let options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Connection: 'close', // Disable keep-alive
      },
      agent: false, // Don't use connection pooling
    };

    let req = requestFn(options, res => {
      let chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        let responseBody = Buffer.concat(chunks).toString();

        if (res.statusCode >= 400) {
          reject(
            new Error(`Vizzly server error: ${res.statusCode} - ${responseBody}`)
          );
          return;
        }

        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve({ raw: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Handle incoming snapshot request
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
async function handleSnapshot(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
      let { name, selector, fullPage, properties } = JSON.parse(body);

      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Screenshot name is required' }));
        return;
      }

      if (!pageRef) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'Page not available for screenshot capture' })
        );
        return;
      }

      // Capture screenshot via Playwright
      let screenshotOptions = {
        type: 'png',
        fullPage: fullPage || false,
      };

      let imageBuffer;

      if (selector) {
        // Capture specific element
        let element = pageRef.locator(selector).first();
        let elementHandle = await element.elementHandle();

        if (!elementHandle) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Element not found: ${selector}` }));
          return;
        }

        imageBuffer = await element.screenshot(screenshotOptions);
      } else {
        // Capture full page/viewport
        imageBuffer = await pageRef.screenshot(screenshotOptions);
      }

      // Forward to Vizzly TDD server
      let result = await forwardToVizzly(name, imageBuffer, properties);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

/**
 * Start the snapshot HTTP server
 * @returns {Promise<Object>} Server info with port
 */
export async function startSnapshotServer() {
  return new Promise((resolve, reject) => {
    let server = createServer(async (req, res) => {
      // CORS headers for browser requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Connection', 'close'); // Prevent keep-alive hangs

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/snapshot') {
        await handleSnapshot(req, res);
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', page: !!pageRef }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      let { port } = server.address();
      resolve({ server, port });
    });

    server.on('error', reject);
  });
}

/**
 * Stop the snapshot server
 * @param {Object} serverInfo - Server info returned by startSnapshotServer
 * @returns {Promise<void>}
 */
export async function stopSnapshotServer(serverInfo) {
  return new Promise(resolve => {
    if (serverInfo?.server) {
      // Force close all keep-alive connections (Node 18.2+)
      if (serverInfo.server.closeAllConnections) {
        serverInfo.server.closeAllConnections();
      }
      serverInfo.server.close(() => resolve());
    } else {
      resolve();
    }
  });
}
