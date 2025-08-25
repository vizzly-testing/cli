import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  timeout: 5000,
  expect: {
    timeout: 5000,
  },

  use: {
    baseURL: 'http://localhost:3030',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 5000,
    actionTimeout: 5000,
    launchOptions: {
      args: process.env.CI ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--max_old_space_size=4096'
      ] : [],
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
  ],

  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
