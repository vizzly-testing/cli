import { reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reviewFixture() });

test.describe('Review Layout', () => {
  test('review chrome, metadata, and one sidebar match the product layout', async ({
    page,
    openReview,
    openQueue,
    capture,
  }) => {
    await openReview();
    await expect(
      page.getByRole('heading', { level: 1, name: 'pricing-page', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('1920×1080', { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Fit width', exact: true })
    ).toBeVisible();
    await capture('fullscreen-review');
    let queue = await openQueue();
    await expect(
      queue.getByRole('button', { name: /pricing-page/ })
    ).toBeVisible();
    await expect(
      queue.getByRole('list', { name: 'pricing-page variants' })
    ).toBeVisible();
    await capture('review-queue-variants');
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    let details = page.getByRole('tabpanel', { name: 'Details', exact: true });
    await expect(details.getByText('1920×1080', { exact: true })).toBeVisible();
    await expect(details.getByText('5,900', { exact: true })).toBeVisible();
    await expect(
      details.getByText('https://example.test/pricing', { exact: true })
    ).toBeVisible();
    await expect(
      details.getByText('PricingCard', { exact: true })
    ).toBeVisible();
    await expect(queue).not.toBeVisible();
    await capture('review-details');
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await expect(details).not.toBeVisible();
    let dimensions = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBe(dimensions.height);
  });

  test('search, filters, and variant navigation operate on the review queue', async ({
    page,
    openReview,
    openQueue,
  }) => {
    await openReview();
    let queue = await openQueue();
    let search = queue.getByRole('textbox', { name: 'Search review queue' });
    await search.fill('checkout-form');
    await expect(
      queue.getByRole('button', { name: 'checkout-form', exact: true })
    ).toBeVisible();
    await expect(
      queue.getByRole('button', { name: /pricing-page/ })
    ).not.toBeVisible();
    await queue
      .getByRole('button', { name: 'Clear search', exact: true })
      .click();
    await queue.getByRole('button', { name: 'New', exact: true }).click();
    await expect(
      queue.getByRole('button', { name: /dashboard-widget/ })
    ).toBeVisible();
    await expect(
      queue.getByRole('button', { name: 'checkout-form', exact: true })
    ).not.toBeVisible();
    await queue.getByRole('button', { name: 'All', exact: true }).click();
    await queue
      .getByRole('button', { name: 'chromium · 1920×1080', exact: true })
      .click();
    await expect(page).toHaveURL(/pricing-page-chromium-1920x1080$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'pricing-page', exact: true })
    ).toBeVisible();
  });
});
