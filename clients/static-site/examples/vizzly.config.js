/**
 * Example Vizzly configuration with Static Site plugin settings
 * Place this file in your project root as vizzly.config.js
 *
 * The staticSite section is validated using Zod at runtime
 */

export default {
  // Standard Vizzly configuration
  server: {
    port: 47392,
    timeout: 30000,
  },

  build: {
    name: 'Build {timestamp}',
    environment: 'test',
  },

  comparison: {
    threshold: 0.1,
  },

  // Static Site plugin configuration
  staticSite: {
    // Viewport configurations
    viewports: [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'mobile-landscape', width: 667, height: 375 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'tablet-landscape', width: 1024, height: 768 },
      { name: 'desktop', width: 1920, height: 1080 },
    ],

    // Browser configuration
    browser: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },

    // Screenshot options
    screenshot: {
      fullPage: false, // Capture visible viewport only
      omitBackground: false, // Include page background
    },

    // Parallel processing
    concurrency: 3, // Number of pages to process simultaneously

    // Page filtering
    include: null, // Optional: Only process pages matching this pattern
    exclude: null, // Optional: Skip pages matching this pattern

    // Page discovery settings
    pageDiscovery: {
      useSitemap: true, // Parse sitemap.xml if available
      sitemapPath: 'sitemap.xml', // Path to sitemap relative to build dir
      scanHtml: true, // Also scan for HTML files directly
    },

    // Note: For page interactions and per-page overrides,
    // create a vizzly.static-site.js file instead
    // See examples/vizzly.static-site.js for details
  },

  // Storybook plugin configuration (if also using Storybook)
  storybook: {
    viewports: [{ name: 'default', width: 1920, height: 1080 }],
    concurrency: 3,
  },
};
