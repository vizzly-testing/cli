import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Review Workflow E2E Tests
 *
 * Tests the core user journey: reviewing visual differences and accepting/rejecting baselines.
 * Uses the mixed-state fixture which contains passed, failed, and new comparisons.
 */
test.describe('Review Workflow', () => {
  let server;
  let fixtureData;
  let port = 3470; // Unique port for this spec

  test.beforeAll(() => {
    fixtureData = JSON.parse(
      readFileSync(join(fixturesDir, 'mixed-state.json'), 'utf8')
    );
  });

  test.beforeEach(async () => {
    server = createReporterTestServer(fixtureData, port);
    await server.start();
  });

  test.afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  test('review and accept a failed comparison', async ({ page }) => {
    // Navigate to reporter
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Verify we see the failed count in filter badges
    await expect(page.getByTestId('filter-status-failed')).toBeVisible();
    await expect(page.getByTestId('filter-status-new')).toBeVisible();

    // Click "Failed" filter to show only failed comparisons
    await page.getByTestId('filter-status-failed').click();

    // Verify only failed comparisons are shown (2 failed in fixture)
    await expect(
      page.getByTestId('comparison-card-pricing-page-firefox-1920x1080')
    ).toBeVisible();
    await expect(
      page.getByTestId('comparison-card-checkout-form-safari-1280x720')
    ).toBeVisible();

    // Passed comparisons should not be visible
    await expect(
      page.getByTestId('comparison-card-homepage-desktop-firefox-1920x1080')
    ).not.toBeVisible();

    // Click the first failed comparison to open fullscreen viewer
    await page
      .getByTestId('comparison-card-pricing-page-firefox-1920x1080')
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify Approve button is visible and click it
    let approveButton = page.getByTestId('btn-approve');
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // Verify the button now shows approved state
    await expect(approveButton).toHaveAttribute('data-active', 'true');

    // Close the viewer with ESC
    await page.keyboard.press('Escape');

    // Verify we're back on the list view
    await expect(page.getByTestId('fullscreen-viewer')).not.toBeVisible();

    // Verify the mutation was tracked
    let response = await page.request.get(
      `http://localhost:${port}/__test__/mutations`
    );
    let { mutations } = await response.json();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('accept');
    expect(mutations[0].id).toBe('pricing-page-firefox-1920x1080');
  });

  test('reject a comparison and see it marked', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Click on a failed comparison
    await page
      .getByTestId('comparison-card-checkout-form-safari-1280x720')
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Click Reject button
    let rejectButton = page.getByTestId('btn-reject');
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    // Verify the button shows rejected state
    await expect(rejectButton).toHaveAttribute('data-active', 'true');

    // In TDD mode, reject is a no-op (no API call) - it just updates UI state
    // The "rejected" state means "don't accept this change"
    // Verify we can close the viewer and come back
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('fullscreen-viewer')).not.toBeVisible();
  });

  test('accept all comparisons via bulk action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Verify the Accept All button is visible
    let acceptAllButton = page.getByTestId('btn-accept-all');
    await expect(acceptAllButton).toBeVisible();

    // Click Accept All
    await acceptAllButton.click();

    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();

    // Click OK to confirm
    await page.getByTestId('confirm-ok').click();

    // Verify success toast appears
    await expect(
      page.locator('text=All baselines accepted successfully')
    ).toBeVisible();

    // Verify the mutation was tracked
    let response = await page.request.get(
      `http://localhost:${port}/__test__/mutations`
    );
    let { mutations } = await response.json();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('accept-all');
  });

  test('cancel bulk accept via confirmation dialog', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Click Accept All
    let acceptAllButton = page.getByTestId('btn-accept-all');
    await acceptAllButton.click();

    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();

    // Click Cancel
    await page.getByTestId('confirm-cancel').click();

    // Verify dialog closes
    await expect(page.getByTestId('confirm-dialog')).not.toBeVisible();

    // Verify NO mutations were tracked
    let response = await page.request.get(
      `http://localhost:${port}/__test__/mutations`
    );
    let { mutations } = await response.json();
    expect(mutations).toHaveLength(0);

    // Verify Accept All button is still visible (nothing changed)
    await expect(acceptAllButton).toBeVisible();
  });
});
