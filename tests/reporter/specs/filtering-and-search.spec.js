import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Filtering and Search E2E Tests
 *
 * Tests the filtering and search functionality in the comparisons list.
 * Uses the mixed-state fixture which has varied statuses, browsers, and viewports.
 */
test.describe('Filtering and Search', () => {
  let server;
  let fixtureData;
  let port = 3471;

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

  test('filter by status shows correct comparisons', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Verify initial state shows all comparisons
    await expect(page.locator('text=All (5)')).toBeVisible();

    // Click "Failed" filter
    await page.locator('text=Failed (2)').click();

    // Verify only failed comparisons are visible
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).toBeVisible();

    // Passed and new should not be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'dashboard-widget-chrome-1920x1080' })
    ).not.toBeVisible();

    // Click "Passed" filter
    await page.locator('text=Passed (2)').click();

    // Verify only passed comparisons are visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'homepage-mobile-chrome-375x812' })
    ).toBeVisible();

    // Failed should not be visible
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).not.toBeVisible();

    // Click "New" filter
    await page.locator('text=New (1)').click();

    // Verify only new comparison is visible
    await expect(
      page.getByRole('heading', { name: 'dashboard-widget-chrome-1920x1080' })
    ).toBeVisible();

    // Others should not be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).not.toBeVisible();

    // Click "All" to reset
    await page.locator('text=All (5)').click();

    // All comparisons should be visible again
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'dashboard-widget-chrome-1920x1080' })
    ).toBeVisible();
  });

  test('search filters comparisons by name', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Type in search box
    let searchBox = page.getByPlaceholder('Search screenshots...');
    await searchBox.fill('homepage');

    // Only homepage comparisons should be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'homepage-mobile-chrome-375x812' })
    ).toBeVisible();

    // Others should not be visible
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).not.toBeVisible();

    // Search for something that doesn't exist
    await searchBox.fill('nonexistent');

    // Should see "No matches" message
    await expect(page.locator('text=No matches')).toBeVisible();

    // Clear search
    await searchBox.fill('');

    // All comparisons should be visible again
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();
  });

  test('filter by browser shows correct comparisons', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Select Chrome from browser dropdown
    await page.getByRole('combobox').nth(1).selectOption('chrome');

    // Only chrome comparisons should be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-mobile-chrome-375x812' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'dashboard-widget-chrome-1920x1080' })
    ).toBeVisible();

    // Firefox comparisons should not be visible
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).not.toBeVisible();

    // Select Safari
    await page.getByRole('combobox').nth(1).selectOption('safari');

    // Only safari comparison should be visible
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).toBeVisible();

    // Chrome comparisons should not be visible now
    await expect(
      page.getByRole('heading', { name: 'homepage-mobile-chrome-375x812' })
    ).not.toBeVisible();
  });

  test('combine status and browser filters', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Filter to failed only
    await page.locator('text=Failed (2)').click();

    // Select Firefox browser
    await page.getByRole('combobox').nth(1).selectOption('firefox');

    // Only failed + firefox comparison should be visible
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();

    // Failed safari should not be visible (wrong browser)
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).not.toBeVisible();

    // Passed firefox should not be visible (wrong status)
    await expect(
      page.getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
    ).not.toBeVisible();
  });

  test('filter state persists in URL', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Apply status filter
    await page.locator('text=Failed (2)').click();

    // Apply search
    let searchBox = page.getByPlaceholder('Search screenshots...');
    await searchBox.fill('pricing');

    // Verify URL contains filter params
    await expect(page).toHaveURL(/filter=failed/);
    await expect(page).toHaveURL(/search=pricing/);

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });

    // Verify filters are still applied
    await expect(
      page.getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
    ).toBeVisible();

    // Other comparisons should still be filtered out
    await expect(
      page.getByRole('heading', { name: 'checkout-form-safari-1280x720' })
    ).not.toBeVisible();

    // Verify search box still has the value
    await expect(searchBox).toHaveValue('pricing');
  });
});
