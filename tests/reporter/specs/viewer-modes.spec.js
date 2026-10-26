import { expect, test } from '../support/reporter-test.js';

test.describe('Viewer Modes', () => {
  test('switch between overlay, toggle, and slide modes', async ({
    page,
    reporter,
    capture,
  }) => {
    await page.goto(`${reporter.url}/`);

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
    await capture('viewer-overlay-mode');

    // Click Toggle mode
    let toggleRadio = page.getByRole('radio', {
      name: /toggle/i,
    });
    await toggleRadio.click();

    // Verify Toggle is now checked
    await expect(toggleRadio).toBeChecked();
    await expect(overlayRadio).not.toBeChecked();

    // 📸 Toggle mode
    await capture('viewer-toggle-mode');

    // Click Slide mode
    let slideRadio = page.getByRole('radio', {
      name: /slide/i,
    });
    await slideRadio.click();

    // Verify Slide is now checked
    await expect(slideRadio).toBeChecked();
    await expect(toggleRadio).not.toBeChecked();

    // 📸 Slide mode
    await capture('viewer-slide-mode');

    // Click back to Overlay
    await overlayRadio.click();
    await expect(overlayRadio).toBeChecked();
  });

  test('view modes not shown for passed comparisons without diff', async ({
    page,
    reporter,
  }) => {
    await page.goto(`${reporter.url}/`);

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

  test('zoom controls adjust zoom level', async ({
    page,
    reporter,
    capture,
  }) => {
    await page.goto(`${reporter.url}/`);

    // Open a comparison
    await page.getByRole('heading', { name: /pricing-page/i }).click();

    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify the initial zoom fits the screenshot width
    await expect(
      page.getByRole('button', { name: 'Fit width', exact: true })
    ).toBeVisible();

    // Click zoom in button
    await page.getByRole('button', { name: /zoom in/i }).click();

    // Verify zoom level changed (now shows percentage)
    await expect(page.getByRole('button', { name: /75%/ })).toBeVisible();

    // Click zoom in again
    await page.getByRole('button', { name: /zoom in/i }).click();
    await expect(page.getByRole('button', { name: /100%/ })).toBeVisible();

    // 📸 Zoomed in view
    await capture('viewer-zoomed-100');

    // Click zoom out
    await page.getByRole('button', { name: /zoom out/i }).click();
    await expect(page.getByRole('button', { name: /75%/ })).toBeVisible();

    // Choose fit-width from the zoom menu.
    await page.getByRole('button', { name: '75%', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Fit width', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Fit width', exact: true })
    ).toBeVisible();

    // Choose actual size from the same menu.
    await page.getByRole('button', { name: 'Fit width', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Actual size', exact: true })
      .click();
    await expect(page.getByRole('button', { name: /100%/ })).toBeVisible();
  });

  test('review shortcut "d" toggles baseline/current in toggle mode', async ({
    page,
    reporter,
  }) => {
    await page.goto(`${reporter.url}/`);

    // Open a failed comparison and switch to Toggle mode
    await page.getByRole('heading', { name: /pricing-page/i }).click();
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();
    await page.getByRole('radio', { name: /toggle/i }).click();

    // Enter review mode so keyboard shortcuts become active
    await page.getByRole('heading', { level: 1 }).click();
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
