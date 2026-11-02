import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import serveStatic from 'serve-static';
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from './src/index.js';

// Path to shared test-site (for CSS assets)
let testSitePath = resolve(import.meta.dirname, '../../test-site');

// Verify test-site exists
if (!existsSync(resolve(testSitePath, 'index.html'))) {
  throw new Error(`test-site not found at ${testSitePath}`);
}

// Start static server for test-site assets
let serve = serveStatic(testSitePath, { fallthrough: false });
let server = createServer((req, res) => {
  serve(req, res, error => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(error?.statusCode || 404, error?.headers);
    res.end();
  });
});

// Listen on port 0 to get a random available port
await new Promise(resolve => {
  server.listen(0, () => resolve());
});

let testSitePort = server.address().port;

// Clean up server on exit - use unref() so it doesn't keep the process alive
server.unref();

// E2E tests config - runs in browser mode
export default defineConfig({
  plugins: [vizzlyPlugin()],
  test: {
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
          provider: playwright(),
        },
      ],
      headless: true,
    },
    include: ['tests/e2e/**/*.test.js'],
    env: {
      TEST_SITE_URL: `http://localhost:${testSitePort}`,
    },
  },
});
