import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 8000,
  expect: {
    timeout: 5000,
  },

  use: {
    baseURL: 'http://localhost:3456',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 5000,
    actionTimeout: 5000,
    launchOptions: {
      args: process.env.CI
        ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--max_old_space_size=4096',
          ]
        : [],
    },
  },

  projects: [
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
        trace: 'off',
      },
    },
    {
      name: 'firefox-mobile',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 375, height: 667 },
        trace: 'off',
      },
    },
  ],
});
