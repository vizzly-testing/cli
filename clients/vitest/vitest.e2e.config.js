import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import handler from 'serve-handler';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from './src/index.js';
import * as commands from './src/commands.js';

// Path to shared test-site
let testSitePath = resolve(import.meta.dirname, '../../test-site');

// Verify test-site exists
if (!existsSync(resolve(testSitePath, 'index.html'))) {
  throw new Error(`test-site not found at ${testSitePath}`);
}

// Start static server for test-site on a random available port
let server = createServer((req, res) => {
  return handler(req, res, {
    public: testSitePath,
    cleanUrls: false,
  });
});

// Listen on port 0 to get a random available port
await new Promise((resolve) => {
  server.listen(0, () => resolve());
});

let testSitePort = server.address().port;

// Clean up server on exit - use unref() so it doesn't keep the process alive
server.unref();

// E2E tests config - runs in browser mode with real test-site
export default defineConfig({
  plugins: [vizzlyPlugin()],
  test: {
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
          provider: playwright({
            launch: {
              viewport: { width: 1280, height: 720 },
            },
          }),
        },
      ],
      headless: true,
      commands,
    },
    include: ['tests/e2e/**/*.test.js'],
  },
  define: {
    __TEST_SITE_URL__: JSON.stringify(`http://localhost:${testSitePort}`),
  },
});
