import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from '../../src/index.js';

export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  plugins: [vizzlyPlugin()],
  test: {
    include: ['tests/browser/matcher.test.js'],
    env: { TEST_SCENARIO: process.env.TEST_SCENARIO },
    browser: {
      enabled: true,
      headless: true,
      viewport: { width: 400, height: 300 },
      instances: [{ browser: 'chromium', provider: playwright() }],
    },
  },
});
