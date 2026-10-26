import { comparisonIds, reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let data = reviewFixture();
data.comparisons.find(
  item => item.id === comparisonIds.pricing
).diffClusters[0].appearance = { mean: 2 };
test.use({ reportData: data });

test('reviewers find offscreen changes with the shipped gutter and stepper', async ({
  page,
  openReview,
  openQueue,
  capture,
}) => {
  await openReview();
  let gutter = page.getByRole('navigation', { name: 'Changes', exact: true });
  let stepper = page.getByRole('toolbar', { name: 'Step through changes' });
  let firstBand = gutter.getByRole('button', { name: /Rows 300–400/ });
  let lastBand = gutter.getByRole('button', { name: /Rows 2,800–2,890/ });
  let label = page.getByRole('status').filter({ hasText: 'Changed' });
  await expect(gutter.getByRole('button')).toHaveCount(2);
  await expect(stepper).toContainText('2 changes');
  await expect(lastBand).not.toBeInViewport();
  if (page.viewportSize().width < 640) await firstBand.focus();
  else await firstBand.hover();
  await expect(label).toContainText('1 region · subtle');
  await expect(label).toContainText('1/2');
  await expect(page.getByTestId('diff-gutter-outline')).toBeVisible();
  await capture('review-change-hover');

  await stepper.getByRole('button', { name: 'Next change' }).click();
  await expect(stepper).toContainText('1 of 2');
  await stepper.getByRole('button', { name: 'Next change' }).click();
  await page.mouse.move(page.viewportSize().width - 5, 115);
  await expect(stepper).toContainText('2 of 2');
  await expect(lastBand).toHaveAttribute('aria-current', 'true');
  await expect(lastBand).toBeInViewport();
  await expect(page.getByTestId('screenshot-canvas')).not.toHaveJSProperty(
    'scrollTop',
    0
  );
  await capture('review-change-navigation');

  await stepper.getByRole('button', { name: 'Next change' }).click();
  await expect(stepper).toContainText('1 of 2');
  await expect(firstBand).toBeInViewport();
  await stepper.getByRole('button', { name: 'Previous change' }).click();
  await expect(stepper).toContainText('2 of 2');
  let fitWidthGutter = await gutter.boundingBox();
  expect(Math.abs(fitWidthGutter.width - 6)).toBeLessThan(0.5);
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await page
    .getByRole('menuitemradio', { name: 'Actual size', exact: true })
    .click();
  let actualSizeGutter = await gutter.boundingBox();
  expect(Math.abs(actualSizeGutter.width - fitWidthGutter.width)).toBeLessThan(
    0.5
  );
  await stepper.getByRole('button', { name: 'Previous change' }).click();
  await stepper.getByRole('button', { name: 'Next change' }).click();
  await expect(lastBand).toBeInViewport();
  await capture('review-change-actual-size');

  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page
    .getByRole('menuitemradio', { name: 'Fit width', exact: true })
    .click();
  await openQueue();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show changed regions' }).check();
  await expect(
    page.getByRole('img', { name: 'Review regions', exact: true })
  ).toBeAttached();
  await page
    .getByRole('button', { name: 'Close sidebar', exact: true })
    .click();
  await stepper.getByRole('button', { name: 'Previous change' }).click();
  await stepper.getByRole('button', { name: 'Next change' }).click();
  await expect(lastBand).toBeInViewport();
  await capture('review-change-regions');
});
