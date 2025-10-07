/**
 * Example Vizzly Storybook configuration
 * Place this file in your project root as vizzly-storybook.config.js
 */

export default {
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
  concurrency: 3, // Number of stories to process simultaneously

  // Story filtering
  include: 'components/**', // Only process stories matching this pattern
  exclude: '**/*.deprecated', // Skip stories matching this pattern

  // Interaction hooks - run before taking screenshots
  interactions: {
    // Hover over all Button stories
    'Button/*': async (page) => {
      await page.hover('button');
    },

    // Click to open Dropdown stories
    'Dropdown/*': async (page) => {
      await page.click('.dropdown-toggle');
      await page.waitForSelector('.dropdown-menu', { visible: true });
    },

    // Fill form fields in Form stories
    'Form/*': async (page) => {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'password123');
    },

    // Trigger tooltip
    'Tooltip/*': async (page) => {
      await page.hover('.tooltip-trigger');
      await page.waitForSelector('.tooltip', { visible: true });
    },

    // Handle modals
    'Modal/Open': async (page) => {
      await page.click('.open-modal-button');
      await page.waitForSelector('.modal', { visible: true });
    },
  },
};
