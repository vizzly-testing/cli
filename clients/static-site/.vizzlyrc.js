/**
 * Vizzly config for Static-Site SDK development
 *
 * This config explicitly loads the local plugin since it's not installed
 * in node_modules during development.
 */
export default {
  // Load the local plugin directly
  plugins: ['./dist/plugin.js'],

  // Default static-site config for E2E tests
  staticSite: {
    viewports: [{ name: 'default', width: 1280, height: 720 }],
    concurrency: 3,
    browser: {
      headless: true,
    },
  },
};
