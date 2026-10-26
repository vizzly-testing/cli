import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { comparisonIds, reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let { pricing: pricingId, checkout: checkoutId, new: newId } = comparisonIds;
test.use({ reportData: reviewFixture() });

test.describe('Review Viewer', () => {
  test('fit modes, actual size, and comparison modes render at the requested scale', async ({
    page,
    openReview,
    capture,
  }) => {
    await openReview();
    let canvas = page.getByTestId('screenshot-canvas');
    let current = canvas.getByRole('img', {
      name: 'pricing-page',
      exact: true,
    });
    let width = await current.evaluate(
      img => img.getBoundingClientRect().width
    );
    let availableWidth = await canvas.evaluate(
      element => element.clientWidth - 40
    );
    expect(Math.abs(width - availableWidth)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Fit width', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Fit to screen', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Fit screen', exact: true })
    ).toBeVisible();
    let bounds = await current.boundingBox();
    let canvasBounds = await canvas.boundingBox();
    expect(bounds.height).toBeLessThanOrEqual(canvasBounds.height - 39);
    await page.getByRole('button', { name: 'Fit screen', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Actual size', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '100%', exact: true })
    ).toBeVisible();
    expect(
      await current.evaluate(img => img.getBoundingClientRect().width)
    ).toBe(await current.evaluate(img => img.naturalWidth));
    await page.keyboard.press('9');
    await page.getByRole('radio', { name: 'Toggle', exact: true }).click();
    await expect(canvas.getByText('Showing Baseline')).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('Space');
    await page.keyboard.press('d');
    await expect(canvas.getByText('Showing Current')).toBeVisible();
    await page.getByRole('radio', { name: 'Slide', exact: true }).click();
    let slider = canvas.getByRole('slider');
    await expect(slider).toBeVisible();
    await slider.fill('75');
    await expect(canvas.getByText('75% current')).toBeVisible();
    await capture('review-slide');
    await page.getByRole('radio', { name: 'Overlay', exact: true }).click();
    await page.keyboard.down('b');
    await expect(canvas.getByText('Showing Baseline')).toBeVisible();
    await page.keyboard.up('b');
    await expect(canvas.getByText('Showing Baseline')).not.toBeVisible();
  });

  test('keyboard decisions finish the queue and focused controls keep their Space behavior', async ({
    page,
    reporter,
    openReview,
    openQueue,
  }) => {
    await openReview();
    let queue = await openQueue();
    await page.getByRole('tab', { name: 'Queue', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('tab', { name: 'Details', exact: true })
    ).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByRole('tab', { name: 'Queue', exact: true })
    ).toBeFocused();
    await queue
      .getByRole('button', { name: 'checkout-form', exact: true })
      .focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
    await expect(
      page.getByText('Review Mode', { exact: true })
    ).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('Space');
    await page.keyboard.press('r');
    await expect(page).toHaveURL(new RegExp(`${newId}$`));
    await page.keyboard.press('a');
    await expect(page).toHaveURL(/pricing-page-chromium-1920x1080$/);
    await page.keyboard.press('a');
    await expect(page).toHaveURL(new RegExp(`${pricingId}$`));
    await page.keyboard.press('a');
    await expect(page).toHaveURL(`${reporter.url}/`);
    expect(
      (await reporter.readReport()).comparisons.every(item =>
        ['passed', 'rejected'].includes(item.status)
      )
    ).toBe(true);
  });

  test('missing baseline images explain how to inspect the current capture', async ({
    page,
    reporter,
    openReview,
  }) => {
    let comparison = reporter.data.comparisons.find(
      item => item.id === pricingId
    );
    await rm(
      join(
        reporter.workingDir,
        '.vizzly',
        comparison.baseline.replace('/images/', '')
      )
    );
    await openReview();
    await page.getByRole('radio', { name: 'Toggle', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Baseline image unavailable'
    );
    await page.getByRole('radio', { name: 'Overlay', exact: true }).click();
    await expect(page.getByRole('alert')).not.toBeVisible();
    await expect(
      page
        .getByTestId('screenshot-canvas')
        .getByRole('img', { name: 'pricing-page', exact: true })
    ).toBeVisible();
  });
});
