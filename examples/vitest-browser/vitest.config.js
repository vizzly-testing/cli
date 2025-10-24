import { defineConfig } from 'vitest/config';
import { vizzlyComparator } from '@vizzly-testing/vitest';

export default defineConfig({
  test: {
    // Enable browser mode for visual testing
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',

      // Recommended: run headless in CI
      headless: process.env.CI === 'true',

      // Optional: configure viewport
      viewport: {
        width: 1280,
        height: 720,
      },

      // Configure Vizzly as the screenshot comparator
      screenshotOptions: {
        // Use Vizzly for screenshot comparison
        comparator: vizzlyComparator,

        // Optional: global threshold (0-1, where 0.01 = 1% difference allowed)
        threshold: 0,

        // Optional: Vizzly-specific options
        vizzly: {
          properties: {
            // Add custom metadata to all screenshots
            browser: 'chromium',
            ci: process.env.CI === 'true',
          },
        },
      },
    },

    // Optional: test timeout for slower visual tests
    testTimeout: 30000,

    // Include test files
    include: ['**/*.test.{js,ts}'],
  },
});
