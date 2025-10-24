import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from './src/index.js';
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
