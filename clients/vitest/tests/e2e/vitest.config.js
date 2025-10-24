import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from '@vizzly-testing/vitest';
import { playwright } from '@vitest/browser-playwright';

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
  },
});
