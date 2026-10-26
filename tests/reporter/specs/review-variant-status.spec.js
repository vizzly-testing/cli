import { comparisonIds, reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let { pricing } = comparisonIds;
let chromiumVariant = 'pricing-page-chromium-1920x1080';
let data = reviewFixture();
let pricingComparison = data.comparisons.find(item => item.id === pricing);
data.comparisons.push({
  ...pricingComparison,
  id: 'pricing-page-webkit-1920x1080',
  properties: { ...pricingComparison.properties, browser: 'webkit' },
});
test.use({ reportData: data });

test('variant decisions stay visible after review and reload, with an accurate group summary', async ({
  page,
  reporter,
  openReview,
  openQueue,
  capture,
}) => {
  await openReview();
  let queue = await openQueue();
  await queue.getByRole('button', { name: 'All', exact: true }).click();
  let group = queue.getByRole('button', { name: /^pricing-page/ });
  await expect(group).toBeVisible();
  let variants = queue.getByRole('list', { name: 'pricing-page variants' });
  let firefox = variants.getByRole('button', { name: /firefox · 1920×1080/ });
  let chromium = variants.getByRole('button', { name: /chromium · 1920×1080/ });
  let webkit = variants.getByRole('button', { name: /webkit · 1920×1080/ });
  await expect(variants.getByRole('img')).toHaveCount(0);
  if (page.viewportSize().width < 640) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
  }

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${chromiumVariant}$`));
  queue = await openQueue();
  await expect(
    firefox.getByRole('img', { name: 'Approved', exact: true })
  ).toBeVisible();
  await expect(chromium.getByRole('img')).toHaveCount(0);
  await expect(webkit.getByRole('img')).toHaveCount(0);
  await expect(group.getByRole('img')).toHaveCount(0);
  await capture('review-variants-partially-approved');
  if (page.viewportSize().width < 640) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
  }

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page).toHaveURL(/pricing-page-webkit-1920x1080$/);
  await page.reload();
  queue = await openQueue();
  await queue.getByRole('button', { name: 'All', exact: true }).click();
  await expect(
    firefox.getByRole('img', { name: 'Approved', exact: true })
  ).toBeVisible();
  await expect(
    chromium.getByRole('img', { name: 'Rejected', exact: true })
  ).toBeVisible();
  await expect(webkit.getByRole('img')).toHaveCount(0);
  await expect(
    group.getByRole('img', { name: 'Rejected', exact: true })
  ).toBeVisible();
  await capture('review-variants-mixed-decisions');

  await firefox.click();
  await expect(page).toHaveURL(new RegExp(`${pricing}$`));
  await expect(
    group.getByRole('img', { name: 'Rejected', exact: true })
  ).toBeVisible();
  if (page.viewportSize().width < 640) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
  }
  await expect(
    page.getByRole('button', { name: 'Approved', exact: true })
  ).toBeVisible();
  expect(
    (await reporter.readReport()).comparisons.find(item => item.id === pricing)
      .status
  ).toBe('passed');
});

test('a group is approved only after every variant is approved', async ({
  page,
  openReview,
  openQueue,
  capture,
}) => {
  await openReview();
  let queue = await openQueue();
  await queue.getByRole('button', { name: 'All', exact: true }).click();
  if (page.viewportSize().width < 640) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
  }
  for (let nextId of [
    chromiumVariant,
    'pricing-page-webkit-1920x1080',
    comparisonIds.checkout,
  ]) {
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${nextId}$`));
  }
  queue = await openQueue();
  await expect(
    queue
      .getByRole('button', { name: /^pricing-page/ })
      .getByRole('img', { name: 'Approved', exact: true })
  ).toBeVisible();
  await expect(
    queue
      .getByRole('list', { name: 'pricing-page variants' })
      .getByRole('img', { name: 'Approved', exact: true })
  ).toHaveCount(3);
  await capture('review-variants-approved');
});
