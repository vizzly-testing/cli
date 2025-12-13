import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

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

  test('switch between overlay, toggle, and slide modes', async ({ page }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Open a failed comparison (has diff image)
    await page
      .getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify Overlay mode is active by default
    let overlayButton = page.getByRole('button', {
      name: 'Overlay',
      exact: true,
    });
    await expect(overlayButton).toHaveClass(/bg-blue-600/);

    // Click Toggle mode
    let toggleButton = page.getByRole('button', {
      name: 'Toggle',
      exact: true,
    });
    await toggleButton.click();

    // Verify Toggle is now active
    await expect(toggleButton).toHaveClass(/bg-blue-600/);
    await expect(overlayButton).not.toHaveClass(/bg-blue-600/);

    // Click Slide mode
    let slideButton = page.getByRole('button', { name: 'Slide', exact: true });
    await slideButton.click();

    // Verify Slide is now active
    await expect(slideButton).toHaveClass(/bg-blue-600/);
    await expect(toggleButton).not.toHaveClass(/bg-blue-600/);

    // Click back to Overlay
    await overlayButton.click();
    await expect(overlayButton).toHaveClass(/bg-blue-600/);
  });

  test('view modes are disabled for passed comparisons without diff', async ({
    page,
  }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    let viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Open a passed comparison (no diff image)
    await page
      .getByRole('heading', { name: 'homepage-desktop-firefox-1920x1080' })
      .click();

    // Verify fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify view mode buttons are disabled (they have cursor-not-allowed class)
    let overlayButton = page.getByRole('button', {
      name: 'Overlay',
      exact: true,
    });
    let toggleButton = page.getByRole('button', {
      name: 'Toggle',
      exact: true,
    });
    let slideButton = page.getByRole('button', { name: 'Slide', exact: true });

    await expect(overlayButton).toHaveClass(/cursor-not-allowed/);
    await expect(toggleButton).toHaveClass(/cursor-not-allowed/);
    await expect(slideButton).toHaveClass(/cursor-not-allowed/);
  });

  test('zoom controls adjust zoom level', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

    // Open a comparison
    await page
      .getByRole('heading', { name: 'pricing-page-firefox-1920x1080' })
      .click();

    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify initial zoom shows "Fit"
    await expect(page.locator('text=Fit')).toBeVisible();

    // Click zoom in button
    await page.getByTitle('Zoom in (+)').click();

    // Verify zoom level changed (now shows percentage)
    await expect(page.locator('text=75%')).toBeVisible();

    // Click zoom in again
    await page.getByTitle('Zoom in (+)').click();
    await expect(page.locator('text=100%')).toBeVisible();

    // Click zoom out
    await page.getByTitle('Zoom out (−)').click();
    await expect(page.locator('text=75%')).toBeVisible();

    // Click Fit button to return to fit mode
    await page.getByTitle('Fit to screen').click();
    await expect(page.locator('text=Fit')).toBeVisible();

    // Click 1:1 button for actual size
    await page.getByTitle('Actual size').click();
    await expect(page.locator('text=100%')).toBeVisible();
  });
});
