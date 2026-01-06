import { module, test } from 'qunit';
import { visit, currentURL, click } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Acceptance | Visual Testing - Pages', function (hooks) {
  setupApplicationTest(hooks);

  // =====================================================
  // HOMEPAGE / DASHBOARD TESTS
  // =====================================================

  test('dashboard - desktop viewport', async function (assert) {
    await visit('/');
    assert.strictEqual(currentURL(), '/');

    await vizzlyScreenshot('dashboard-desktop');
    assert.dom('[data-test-page="index"]').exists();
  });

  test('dashboard - tablet viewport', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('dashboard-tablet', { width: 768, height: 1024 });
    assert.dom('[data-test-page="index"]').exists();
  });

  test('dashboard - mobile viewport', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('dashboard-mobile', { width: 375, height: 667 });
    assert.dom('[data-test-page="index"]').exists();
  });

  // =====================================================
  // FORMS PAGE TESTS
  // =====================================================

  test('forms page - desktop viewport', async function (assert) {
    await visit('/forms');
    assert.strictEqual(currentURL(), '/forms');

    await vizzlyScreenshot('forms-desktop');
    assert.dom('[data-test-page="forms"]').exists();
  });

  test('forms page - shows validation errors', async function (assert) {
    await visit('/forms');

    // The error form should be visible with validation errors
    assert.dom('[data-test-card="error-form"]').exists();
    assert.dom('[data-test-alert="form-error"]').exists();

    await vizzlyScreenshot('forms-validation-errors');
  });

  test('forms page - disabled form state', async function (assert) {
    await visit('/forms');

    assert.dom('[data-test-card="disabled-form"]').exists();
    assert.dom('[data-test-alert="disabled-notice"]').exists();

    await vizzlyScreenshot('forms-disabled-state');
  });

  // =====================================================
  // COMPONENTS PAGE TESTS
  // =====================================================

  test('components page - desktop viewport', async function (assert) {
    await visit('/components');
    assert.strictEqual(currentURL(), '/components');

    await vizzlyScreenshot('components-desktop');
    assert.dom('[data-test-page="components"]').exists();
  });

  test('components page - buttons showcase', async function (assert) {
    await visit('/components');

    assert.dom('[data-test-card="buttons-showcase"]').exists();
    assert.dom('[data-test-button="btn-primary"]').exists();
    assert.dom('[data-test-button="btn-secondary"]').exists();
    assert.dom('[data-test-button="btn-danger"]').exists();
    assert.dom('[data-test-button="btn-ghost"]').exists();

    await vizzlyScreenshot('components-buttons');
  });

  test('components page - alerts showcase', async function (assert) {
    await visit('/components');

    assert.dom('[data-test-card="alerts-showcase"]').exists();
    assert.dom('[data-test-alert="alert-info"]').exists();
    assert.dom('[data-test-alert="alert-success"]').exists();
    assert.dom('[data-test-alert="alert-warning"]').exists();
    assert.dom('[data-test-alert="alert-error"]').exists();

    await vizzlyScreenshot('components-alerts');
  });

  test('components page - modal open state', async function (assert) {
    await visit('/components');

    // Open the medium modal
    await click('[data-test-button="open-modal-medium"]');
    assert.dom('[data-test-modal="demo-modal"]').exists();

    await vizzlyScreenshot('components-modal-open');

    // Note: We're using scope: 'page' to capture the modal backdrop too
    await vizzlyScreenshot('components-modal-full', { scope: 'page' });
  });

  // =====================================================
  // LONG PAGE / FULL PAGE TESTS
  // =====================================================

  test('long page - viewport only', async function (assert) {
    await visit('/long-page');
    assert.strictEqual(currentURL(), '/long-page');

    // Default capture - just what's visible in viewport
    await vizzlyScreenshot('long-page-viewport');
    assert.dom('[data-test-page="long-page"]').exists();
  });

  test('long page - full page capture', async function (assert) {
    await visit('/long-page');

    // Capture entire scrollable content
    await vizzlyScreenshot('long-page-full', { fullPage: true });

    // The footer should exist (proves page loaded fully)
    assert.dom('[data-test-footer]').exists();
  });

  // =====================================================
  // ELEMENT SELECTOR TESTS
  // =====================================================

  test('element capture - stats grid only', async function (assert) {
    await visit('/');

    // Capture just the stats cards
    await vizzlyScreenshot('element-stats-grid', {
      selector: '.stats-grid',
    });

    assert.dom('[data-test-card="stat-users"]').exists();
  });

  test('element capture - data table only', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('element-data-table', {
      selector: '[data-test-data-table="users"]',
    });

    assert.dom('[data-test-data-table="users"]').exists();
  });

  test('element capture - single card', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('element-single-card', {
      selector: '[data-test-card="users-table"]',
    });

    assert.dom('[data-test-card="users-table"]').exists();
  });

  test('element capture - navigation bar', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('element-nav-bar', {
      selector: '[data-test-nav-bar]',
    });

    assert.dom('[data-test-nav-bar]').exists();
  });

  // =====================================================
  // RESPONSIVE DESIGN TESTS
  // =====================================================

  test('responsive - forms at mobile width', async function (assert) {
    await visit('/forms');

    await vizzlyScreenshot('responsive-forms-mobile', {
      width: 375,
      height: 812,
    });

    assert.dom('[data-test-page="forms"]').exists();
  });

  test('responsive - components at tablet width', async function (assert) {
    await visit('/components');

    await vizzlyScreenshot('responsive-components-tablet', {
      width: 768,
      height: 1024,
    });

    assert.dom('[data-test-page="components"]').exists();
  });

  test('responsive - dashboard at wide desktop', async function (assert) {
    await visit('/');

    await vizzlyScreenshot('responsive-dashboard-wide', {
      width: 1920,
      height: 1080,
    });

    assert.dom('[data-test-page="index"]').exists();
  });
});
