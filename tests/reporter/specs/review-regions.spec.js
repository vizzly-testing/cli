import { reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reviewFixture() });

test.describe('Review Regions', () => {
  test('change overview jumps to offscreen differences and details can show regions', async ({
    page,
    openReview,
    openQueue,
    capture,
  }) => {
    await openReview();
    let overview = page.getByRole('navigation', {
      name: 'Changes overview',
      exact: true,
    });
    await expect(overview).toBeVisible();
    await overview.getByRole('button', { name: /Rows 2,800/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Rows 2,800/ })
    ).toBeInViewport();
    await expect(page.getByTestId('screenshot-canvas')).not.toHaveJSProperty(
      'scrollTop',
      0
    );
    await capture('review-change-navigation');
    await openQueue();
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show changed regions' }).check();
    await expect(
      page.getByRole('img', { name: 'Review regions', exact: true })
    ).toBeAttached();
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    // Closing the sidebar changes the image scale; center the region again.
    await overview.getByRole('button', { name: /Rows 2,800/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Rows 2,800/ })
    ).toBeInViewport();
    await capture('review-change-regions');
  });
});
