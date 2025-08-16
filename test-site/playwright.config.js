import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  timeout: 5000,

  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 }
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 }
      },
    },
    // Only run Firefox and Safari on desktop for core coverage
    ...(process.env.CI ? [] : [
      {
        name: 'firefox-desktop',
        use: {
          ...devices['Desktop Firefox'],
          viewport: { width: 1920, height: 1080 }
        },
      },
      {
        name: 'webkit-desktop',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 1920, height: 1080 }
        },
      },
    ]),
  ],

  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
