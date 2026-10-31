/**
 * Default configuration values
 */
export let CONFIG_DEFAULTS = {
  apiUrl: 'https://app.vizzly.dev',
  server: { port: 47392, timeout: 30000 },
  build: { name: 'Build {timestamp}', environment: 'test' },
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000,
  },
  comparison: { threshold: 2.0, minClusterSize: 2 },
  tdd: { openReport: false },
  plugins: [],
};
