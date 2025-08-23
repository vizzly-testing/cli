export default {
  // API configuration
  // Set VIZZLY_TOKEN environment variable or uncomment and set here:
  // apiToken: 'your-token-here',
  
  // Screenshot configuration
  screenshots: {
    directory: './screenshots',
    formats: ['png']
  },
  
  // Server configuration
  server: {
    port: 47392,
    screenshotPath: '/screenshot'
  },
  
  // Comparison configuration
  comparison: {
    threshold: 0.1,
    ignoreAntialiasing: true
  },
  
  // Upload configuration
  upload: {
    concurrency: 5,
    timeout: 30000
  }
};
