import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from './src/index.js';

// E2E tests config - runs in browser mode
// These tests verify actual browser integration with Vizzly
// Tests render HTML inline (using document.body.innerHTML) since
// Vitest browser mode runs inside a browser sandbox
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
