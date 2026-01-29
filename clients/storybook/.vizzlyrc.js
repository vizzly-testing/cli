/**
 * Vizzly config for Storybook SDK development
 *
 * This config explicitly loads the local plugin since it's not installed
 * in node_modules during development.
 */
export default {
  // Load the local plugin directly
  plugins: ['./dist/plugin.js'],

  // Default storybook config for E2E tests
  storybook: {
    viewports: [{ name: 'default', width: 1280, height: 720 }],
    concurrency: 3,
    browser: {
      headless: true,
    },
  },
};
