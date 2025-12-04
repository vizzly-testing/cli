/**
 * Example vizzly.static-site.js file
 * Place this file in your project root alongside vizzly.config.js
 *
 * This file is specifically for defining page interactions and per-page overrides
 * that require JavaScript logic. Keep your main vizzly.config.js clean!
 */

export default {
  // Global interaction hooks - run before taking screenshots
  // Keys are glob patterns matching page paths
  interactions: {
    // Scroll to footer on all blog pages
    'blog/*': async page => {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    },

    // Click "Load More" button on portfolio pages
    'portfolio/*': async page => {
      let loadMoreBtn = await page.$('.load-more');
      if (loadMoreBtn) {
        await loadMoreBtn.click();
        // Wait for content to load
        await page.waitForTimeout(1000);
      }
    },

    // Expand all accordions on docs pages
    'docs/*': async page => {
      await page.evaluate(() => {
        let accordions = document.querySelectorAll('.accordion-toggle');
        for (let acc of accordions) {
          acc.click();
        }
      });
    },

    // Named interaction - can be referenced in pages config
    'show-product-details': async page => {
      await page.click('.view-details-btn');
      await page.waitForSelector('.product-modal', { visible: true });
    },

    // Wait for specific element on all pages
    '**': async page => {
      // Ensure app is fully loaded before screenshots
      await page.waitForSelector('.app-loaded', { visible: true });
    },

    // Specific page interaction
    '/contact': async page => {
      // Fill out form to show validation states
      await page.type('#name', 'Test User');
      await page.type('#email', 'test@example.com');
    },
  },

  // Per-page configuration overrides
  // Keys are page paths or glob patterns
  pages: {
    // Only capture mobile and desktop for homepage
    '/': {
      viewports: ['mobile', 'desktop'], // References viewport names from main config
    },

    // Full page screenshot for pricing page
    '/pricing': {
      screenshot: {
        fullPage: true,
      },
    },

    // Use named interaction for product pages
    'products/*': {
      interaction: 'show-product-details',
    },

    // Multiple overrides for about page
    '/about': {
      viewports: ['tablet', 'desktop'],
      screenshot: {
        fullPage: true,
      },
    },

    // Blog posts get different viewport set
    'blog/*': {
      viewports: ['mobile', 'tablet'],
    },
  },
};
