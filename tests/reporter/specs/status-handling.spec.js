import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let data = {
  ...reportFixture(),
  comparisons: [
    ...reportFixture().comparisons,
    {
      id: 'alerts-widget-chrome-1440x900',
      name: 'alerts-widget-chrome-1440x900',
      originalName: 'alerts-widget',
      status: 'baseline-created',
      baseline: null,
      current: '/images/screenshots/homepage-desktop.png',
      diff: null,
      diffPercentage: null,
      threshold: 2.0,
      properties: {
        browser: 'chrome',
        viewport: {
          width: 1440,
          height: 900,
        },
      },
      timestamp: 1700000006000,
    },
  ],
};
test.use({ reportData: data });

test.describe('Status Handling', () => {
  test('baseline-created is treated as a new comparison in filters and actions', async ({
    page,
    reporter,
  }) => {
    await page.goto(`${reporter.url}/`);

    // Existing fixture has one "new" + one "baseline-created" item.
    await expect(page.getByRole('button', { name: /New.*2/i })).toBeVisible();

    await page.getByRole('button', { name: /New.*2/i }).click();

    await expect(
      page.getByRole('heading', { name: /dashboard-widget/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /alerts-widget/i })
    ).toBeVisible();

    // Failed (2) + new-like (2) = Accept All (4)
    await expect(
      page.getByRole('button', { name: /Accept All \(4\)/ })
    ).toBeVisible();
  });
});
