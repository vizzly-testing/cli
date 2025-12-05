import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from './src/index.js';

// E2E tests config - runs in browser mode
// These tests verify actual browser integration with Vizzly
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
  },
});
