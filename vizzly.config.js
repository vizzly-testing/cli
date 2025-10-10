export default {
  // Server configuration (for run command)
  server: {
    port: 47392,
    timeout: 30000
  },

  // Build configuration
  build: {
    name: 'Build {timestamp}',
    environment: 'test'
  },

  // Upload configuration (for upload command)
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000
  },

  // Comparison configuration
  comparison: {
    threshold: 0.1
  },

  // TDD configuration
  tdd: {
    openReport: false // Whether to auto-open HTML report in browser
  }
};
