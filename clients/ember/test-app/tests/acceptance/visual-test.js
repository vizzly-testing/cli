import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';

module('Acceptance | Visual Testing', function (hooks) {
  setupApplicationTest(hooks);

  test('captures homepage screenshot', async function (assert) {
    await visit('/');

    assert.strictEqual(currentURL(), '/');

    // Capture visual snapshot at default 1280x720 viewport
    await vizzlySnapshot('homepage');

    // App displays "Welcome to Ember"
    assert.dom('h2').hasText('Welcome to Ember');
  });

  test('captures homepage at mobile viewport', async function (assert) {
    await visit('/');

    // Capture at mobile viewport size
    await vizzlySnapshot('homepage-mobile', { width: 375, height: 667 });

    assert.dom('h2').exists();
  });
});
