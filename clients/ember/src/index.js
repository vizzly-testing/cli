/**
 * @vizzly-testing/ember
 *
 * Visual testing SDK for Ember.js projects using Testem.
 * Enables screenshot capture in acceptance and integration tests.
 *
 * @module @vizzly-testing/ember
 *
 * @example
 * // testem.js
 * const { configure } = require('@vizzly-testing/ember');
 *
 * module.exports = configure({
 *   test_page: 'tests/index.html?hidepassed',
 *   launch_in_ci: ['Chrome'],
 *   launch_in_dev: ['Chrome']
 * });
 *
 * @example
 * // tests/acceptance/my-test.js
 * import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';
 *
 * test('renders correctly', async function(assert) {
 *   await visit('/');
 *   await vizzlyScreenshot('homepage');
 *   assert.ok(true);
 * });
 */

export { configure } from './testem-config.js';
