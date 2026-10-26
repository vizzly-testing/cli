import { comparisonIds, reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let { pricing, checkout, new: newId } = comparisonIds;
let pricingVariant = 'pricing-page-chromium-1920x1080';
test.use({ reportData: reviewFixture() });

async function selectFilter(page, openQueue, name) {
  let queue = await openQueue();
  await queue.getByRole('button', { name, exact: true }).click();
  if (page.viewportSize().width < 640) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
  }
}

test.describe('Review queue advancement', () => {
  test('an approved capture outside the queue can resume the pending reviews', async ({
    page,
    openReview,
  }) => {
    await openReview('homepage-desktop-firefox-1920x1080');
    await expect(
      page.getByText('0/4', { exact: true }).filter({ visible: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${pricing}$`));
    await expect(
      page.getByText('1/4', { exact: true }).filter({ visible: true })
    ).toBeVisible();
  });

  test('Changes follows the displayed variant order and finishes after the last decision', async ({
    page,
    reporter,
    openReview,
    openQueue,
    capture,
  }) => {
    await openReview();
    await selectFilter(page, openQueue, 'Changes');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${pricingVariant}$`));
    await expect(
      page.getByText('1/2', { exact: true }).filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next', exact: true })
    ).toBeEnabled();
    await capture('review-queue-after-approval');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkout}$`));
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page).toHaveURL(`${reporter.url}/`);
    let report = await reporter.readReport();
    expect(report.comparisons.find(item => item.id === pricing).status).toBe(
      'passed'
    );
    expect(
      report.comparisons.find(item => item.id === pricingVariant).status
    ).toBe('passed');
    expect(report.comparisons.find(item => item.id === checkout).status).toBe(
      'rejected'
    );
    expect(report.comparisons.find(item => item.id === newId).status).toBe(
      'new'
    );
    await capture('review-changes-queue-complete');
  });

  test('New finishes its queue without moving into other changes', async ({
    page,
    reporter,
    openReview,
    openQueue,
  }) => {
    await openReview(newId);
    await selectFilter(page, openQueue, 'New');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(`${reporter.url}/`);
    let report = await reporter.readReport();
    expect(report.comparisons.find(item => item.id === newId).status).toBe(
      'passed'
    );
    expect(report.comparisons.find(item => item.id === pricing).status).toBe(
      'failed'
    );
  });

  test('All wraps to the first pending capture and skips approved and rejected items', async ({
    page,
    reporter,
    openReview,
    openQueue,
  }) => {
    await openReview(newId);
    await selectFilter(page, openQueue, 'All');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${pricing}$`));
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${pricingVariant}$`));
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkout}$`));
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(`${reporter.url}/`);
    expect(
      (await reporter.readReport()).comparisons.every(item =>
        ['passed', 'rejected'].includes(item.status)
      )
    ).toBe(true);
  });

  test('search limits the queue completed by an approval', async ({
    page,
    reporter,
    openReview,
    openQueue,
  }) => {
    await openReview(checkout);
    let queue = await openQueue();
    await queue.getByRole('button', { name: 'Changes', exact: true }).click();
    await queue
      .getByRole('textbox', { name: 'Search review queue' })
      .fill('checkout-form');
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(`${reporter.url}/`);
    expect(
      (await reporter.readReport()).comparisons.find(
        item => item.id === pricing
      ).status
    ).toBe('failed');
  });
});
