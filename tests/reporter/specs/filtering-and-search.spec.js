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

  test('filter by status shows correct screenshots', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // User sees filter buttons with counts
    await expect(page.getByRole('button', { name: /All.*5/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Failed.*2/i })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /New.*1/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Passed.*2/i })
    ).toBeVisible();

    // User clicks "Failed" filter
    await page.getByRole('button', { name: /Failed.*2/i }).click();

    // User sees only failed screenshots (check headings to be specific)
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /checkout-form/i })
    ).toBeVisible();

    // Passed and new screenshots are hidden
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /dashboard-widget/i })
    ).not.toBeVisible();

    // User clicks "Passed" filter
    await page.getByRole('button', { name: /Passed.*2/i }).click();

    // User sees only passed screenshots
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /homepage-mobile/i })
    ).toBeVisible();

    // Failed screenshots are hidden
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).not.toBeVisible();

    // User clicks "New" filter
    await page.getByRole('button', { name: /New.*1/i }).click();

    // User sees only new screenshot
    await expect(
      page.getByRole('heading', { name: /dashboard-widget/i })
    ).toBeVisible();

    // Others are hidden
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).not.toBeVisible();

    // User clicks "All" to reset
    await page.getByRole('button', { name: /All.*5/i }).click();

    // All screenshots visible again
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /dashboard-widget/i })
    ).toBeVisible();
  });

  test('search filters screenshots by name', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // User types in search box
    let searchBox = page.getByRole('textbox', {
      name: /search screenshots/i,
    });
    await searchBox.fill('homepage');

    // Only homepage screenshots are visible
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /homepage-mobile/i })
    ).toBeVisible();

    // Others are hidden
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /checkout-form/i })
    ).not.toBeVisible();

    // User searches for something that doesn't exist
    await searchBox.fill('nonexistent');

    // User sees empty state heading
    await expect(
      page.getByRole('heading', { name: /no matches/i })
    ).toBeVisible();

    // User clears search
    await searchBox.fill('');

    // All screenshots visible again
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();
  });

  test('filter by browser shows correct screenshots', async ({ page }) => {
    // Skip on mobile - browser dropdown is hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'Browser filter hidden on mobile');

    await page.goto(`http://localhost:${port}/`);

    // User opens browser dropdown and selects Chrome
    await page.getByTestId('filter-browser').click();
    // Select from dropdown menu - button name includes icon alt text
    await page.getByRole('button', { name: 'chrome browser chrome' }).click();

    // Only chrome screenshots are visible
    await expect(
      page.getByRole('heading', { name: /homepage-mobile/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /dashboard-widget/i })
    ).toBeVisible();

    // Firefox screenshots are hidden
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).not.toBeVisible();

    // User selects Safari
    await page.getByTestId('filter-browser').click();
    await page.getByRole('button', { name: 'safari browser safari' }).click();

    // Only safari screenshot is visible
    await expect(
      page.getByRole('heading', { name: /checkout-form/i })
    ).toBeVisible();

    // Chrome screenshots are hidden now
    await expect(
      page.getByRole('heading', { name: /homepage-mobile/i })
    ).not.toBeVisible();
  });

  test('combine status and browser filters', async ({ page }) => {
    // Skip on mobile - browser dropdown is hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'Browser filter hidden on mobile');

    await page.goto(`http://localhost:${port}/`);

    // User filters to failed only
    await page.getByRole('button', { name: /Failed.*2/i }).click();

    // User selects Firefox from browser dropdown
    await page.getByTestId('filter-browser').click();
    await page.getByRole('button', { name: 'firefox browser firefox' }).click();

    // Only failed + firefox screenshot is visible
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();

    // Failed safari is hidden (wrong browser)
    await expect(
      page.getByRole('heading', { name: /checkout-form/i })
    ).not.toBeVisible();

    // Passed firefox is hidden (wrong status)
    await expect(
      page.getByRole('heading', { name: /homepage-desktop/i })
    ).not.toBeVisible();
  });

  test('filter state persists in URL', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // User applies status filter
    await page.getByRole('button', { name: /Failed.*2/i }).click();

    // User searches
    let searchBox = page.getByRole('textbox', {
      name: /search screenshots/i,
    });
    await searchBox.fill('pricing');

    // URL contains filter params
    await expect(page).toHaveURL(/filter=failed/);
    await expect(page).toHaveURL(/search=pricing/);

    // User reloads the page
    await page.reload();

    // Filters are still applied - only pricing-page visible
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();

    // Other failed screenshot is filtered out by search
    await expect(
      page.getByRole('heading', { name: /checkout-form/i })
    ).not.toBeVisible();

    // Search box still has the value
    await expect(searchBox).toHaveValue('pricing');
  });
});
