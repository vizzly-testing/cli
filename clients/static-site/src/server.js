/**
 * HTTP server for serving static site files using serve-handler
 * Needed because file:// protocol doesn't load assets properly
 */

import { createServer } from 'http';
import { resolve } from 'path';
import handler from 'serve-handler';

/**
 * Start an HTTP server to serve static files
 * @param {string} rootDir - Root directory to serve
 * @param {number} [port=0] - Port to listen on (0 = random available port)
 * @returns {Promise<Object>} Server instance with { server, port, url }
 */
export async function startStaticServer(rootDir, port = 0) {
  let absoluteRoot = resolve(rootDir);

  let server = createServer((req, res) => {
    return handler(req, res, {
      public: absoluteRoot,
      cleanUrls: false,
      trailingSlash: false,
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      let address = server.address();
      let actualPort = address.port;
      let url = `http://localhost:${actualPort}`;

      resolve({
        server,
        port: actualPort,
        url,
      });
    });

    server.on('error', reject);
  });
}

/**
 * Stop a static server
 * @param {Object} serverInfo - Server info from startStaticServer
 * @param {number} [timeout=5000] - Max time to wait for server to close (ms)
 * @returns {Promise<void>}
 */
export async function stopStaticServer(serverInfo, timeout = 5000) {
  if (!serverInfo || !serverInfo.server) {
    return;
  }

  return Promise.race([
    new Promise(resolve => {
      serverInfo.server.close(() => resolve());
    }),
    new Promise(resolve => setTimeout(resolve, timeout)),
  ]);
}
