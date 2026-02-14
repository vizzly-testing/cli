import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { vizzlyScreenshot } from '../../../dist/client/index.js';
import { createReporterTestServer } from '../test-helper.js';
import { screenshotFullscreenViewer } from './viewer-test-utils.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Viewer Modes E2E Tests
 *
 * Tests the comparison viewer modes (overlay, toggle, slide) and zoom controls.
 */
test.describe('Viewer Modes', () => {
  let server;
  let fixtureData;
  let port = 3472;

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

  test('switch between overlay, toggle, and slide modes', async ({
    page,
    browserName,
  }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    await page.goto(`http://localhost:${port}/`);

    // Open a failed comparison (has diff image)
    await page.getByRole('heading', { name: /pricing-page/i }).click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify View mode radiogroup is visible
    let viewModeGroup = page.getByRole('radiogroup', { name: 'View mode' });
    await expect(viewModeGroup).toBeVisible();

    // Verify Overlay mode is checked by default
    let overlayRadio = page.getByRole('radio', {
      name: /overlay/i,
    });
    await expect(overlayRadio).toBeChecked();

    // 📸 Overlay mode
    await vizzlyScreenshot(
      'viewer-overlay-mode',
      await screenshotFullscreenViewer(page),
      { browser: browserName, viewport: page.viewportSize() }
    );

    // Click Toggle mode
    let toggleRadio = page.getByRole('radio', {
      name: /toggle/i,
    });
    await toggleRadio.click();

    // Verify Toggle is now checked
    await expect(toggleRadio).toBeChecked();
    await expect(overlayRadio).not.toBeChecked();

    // 📸 Toggle mode
    await vizzlyScreenshot(
      'viewer-toggle-mode',
      await screenshotFullscreenViewer(page),
      { browser: browserName, viewport: page.viewportSize() }
    );

    // Click Slide mode
    let slideRadio = page.getByRole('radio', {
      name: /slide/i,
    });
    await slideRadio.click();

    // Verify Slide is now checked
    await expect(slideRadio).toBeChecked();
    await expect(toggleRadio).not.toBeChecked();

    // 📸 Slide mode
    await vizzlyScreenshot(
      'viewer-slide-mode',
      await screenshotFullscreenViewer(page),
      { browser: browserName, viewport: page.viewportSize() }
    );

    // Click back to Overlay
    await overlayRadio.click();
    await expect(overlayRadio).toBeChecked();
  });

  test('view modes not shown for passed comparisons without diff', async ({
    page,
  }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    await page.goto(`http://localhost:${port}/`);

    // Filter to passed to find passed comparison
    await page.getByRole('button', { name: /Passed/i }).click();

    // Open a passed comparison (no diff image)
    await page.getByRole('heading', { name: /homepage-desktop/i }).click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify view mode selector is NOT shown for passed comparisons
    // (since there's nothing to compare - no diff)
    let viewModeGroup = page.getByRole('radiogroup', { name: 'View mode' });
    await expect(viewModeGroup).not.toBeVisible();
  });

  test('zoom controls adjust zoom level', async ({ page, browserName }) => {
    await page.goto(`http://localhost:${port}/`);

    // Open a comparison
    await page.getByRole('heading', { name: /pricing-page/i }).click();

    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify initial zoom shows "Fit" (exact match to avoid "Fit to screen")
    await expect(
      page.getByRole('button', { name: 'Fit', exact: true })
    ).toBeVisible();

    // Click zoom in button
    await page.getByRole('button', { name: /zoom in/i }).click();

    // Verify zoom level changed (now shows percentage)
    await expect(page.getByRole('button', { name: /75%/ })).toBeVisible();

    // Click zoom in again
    await page.getByRole('button', { name: /zoom in/i }).click();
    await expect(page.getByRole('button', { name: /100%/ })).toBeVisible();

    // 📸 Zoomed in view
    await vizzlyScreenshot(
      'viewer-zoomed-100',
      await screenshotFullscreenViewer(page),
      { browser: browserName, viewport: page.viewportSize() }
    );

    // Click zoom out
    await page.getByRole('button', { name: /zoom out/i }).click();
    await expect(page.getByRole('button', { name: /75%/ })).toBeVisible();

    // Click Fit button to return to fit mode
    await page.getByRole('button', { name: /fit to screen/i }).click();
    await expect(
      page.getByRole('button', { name: 'Fit', exact: true })
    ).toBeVisible();

    // Click 1:1 button for actual size
    await page.getByRole('button', { name: '1:1' }).click();
    await expect(page.getByRole('button', { name: /100%/ })).toBeVisible();
  });

  test('review shortcut "d" toggles baseline/current in toggle mode', async ({
    page,
  }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    await page.goto(`http://localhost:${port}/`);

    // Open a failed comparison and switch to Toggle mode
    await page.getByRole('heading', { name: /pricing-page/i }).click();
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();
    await page.getByRole('radio', { name: /toggle/i }).click();

    // Enter review mode so keyboard shortcuts become active
    await page.keyboard.press('Space');
    await expect(page.getByText('Review Mode')).toBeVisible();

    await expect(page.getByText('Showing Baseline')).toBeVisible();

    // D shortcut should flip to current image in Toggle mode
    await page.keyboard.press('d');
    await expect(page.getByText('Showing Current')).toBeVisible();

    // Pressing again should flip back
    await page.keyboard.press('d');
    await expect(page.getByText('Showing Baseline')).toBeVisible();
  });
});
