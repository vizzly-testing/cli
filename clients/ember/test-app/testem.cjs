'use strict';

const { configure } = require('@vizzly-testing/ember');

if (typeof module !== 'undefined') {
  module.exports = configure({
    // Testem must run from dist/ where Ember builds output
    // This is how `ember test` works - it sets cwd to outputPath
    cwd: 'dist',
    test_page: 'tests/index.html?hidepassed',
    disable_watching: true,
    launch_in_ci: ['Chrome'],
    launch_in_dev: ['Chrome'],
    browser_start_timeout: 120,
    browser_args: {
      Chrome: {
        ci: ['--headless', '--disable-gpu'],
        dev: [], // headed for local debugging
      },
    },
  });
}
