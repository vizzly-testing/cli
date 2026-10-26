import { defineConfig, devices } from '@playwright/test';

let browserName = process.env.REPORTER_BROWSER || 'firefox';
let desktopDevice =
  browserName === 'chromium' ? 'Desktop Chrome' : 'Desktop Firefox';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
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
    reducedMotion: 'reduce',
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
      name: `${browserName}-desktop`,
      use: {
        ...devices[desktopDevice],
        viewport: { width: 1920, height: 1080 },
        trace: 'off',
      },
    },
    {
      name: `${browserName}-mobile`,
      use: {
        ...devices[desktopDevice],
        viewport: { width: 375, height: 667 },
        trace: 'off',
      },
    },
  ],
});
