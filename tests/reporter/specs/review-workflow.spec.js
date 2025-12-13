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
    await expect(page.locator('text=Failed (2)')).toBeVisible();
    await expect(page.locator('text=New (1)')).toBeVisible();

    // Click "Failed" filter to show only failed comparisons
    await page.locator('text=Failed (2)').click();

    // Verify only failed comparisons are shown (2 failed in fixture)
    // Use heading role to be more specific (avoids matching tooltips)
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).toBeVisible();

    // Passed comparisons should not be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).not.toBeVisible();

    // Click the first failed comparison to open fullscreen viewer
    await page
      .getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify Approve button is visible
    let approveButton = page.getByRole('button', { name: 'Approve' });
    await expect(approveButton).toBeVisible();

    // Click Approve
    await approveButton.click();

    // Verify the button now shows approved state (green background)
    await expect(approveButton).toHaveClass(/bg-green-600/);

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
      .getByRole('heading', { name: 'checkout-form-safari-1280x720' })
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Click Reject button
    let rejectButton = page.getByRole('button', { name: 'Reject' });
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    // Verify the button shows rejected state (red background)
    await expect(rejectButton).toHaveClass(/bg-red-600/);

    // In TDD mode, reject is a no-op (no API call) - it just updates UI state
    // The "rejected" state means "don't accept this change"
    // Verify we can close the viewer and come back
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('fullscreen-viewer')).not.toBeVisible();
  });

  test('accept all comparisons via bulk action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Verify the Accept All button is visible with correct count
    // 2 failed + 1 new = 3 to accept
    let acceptAllButton = page.getByRole('button', { name: 'Accept All (3)' });
    await expect(acceptAllButton).toBeVisible();

    // Click Accept All
    await acceptAllButton.click();

    // Verify confirmation dialog appears
    await expect(
      page.locator('text=Accept all changes as new baselines?')
    ).toBeVisible();

    // Click OK to confirm
    await page.getByRole('button', { name: 'OK' }).click();

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
    let acceptAllButton = page.getByRole('button', { name: 'Accept All (3)' });
    await acceptAllButton.click();

    // Verify confirmation dialog appears
    await expect(
      page.locator('text=Accept all changes as new baselines?')
    ).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Verify dialog closes
    await expect(
      page.locator('text=Accept all changes as new baselines?')
    ).not.toBeVisible();

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
