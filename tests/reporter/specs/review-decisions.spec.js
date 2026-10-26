import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { comparisonIds, reviewFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

let { pricing: pricingId, checkout: checkoutId, new: newId } = comparisonIds;
test.use({ reportData: reviewFixture() });

test.describe('Review Decisions', () => {
  test('approve and reject persist to disk and advance through only unreviewed captures', async ({
    page,
    reporter,
    openReview,
    openQueue,
  }) => {
    await openReview();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
    let report = await reporter.readReport();
    expect(report.comparisons.find(item => item.id === pricingId).status).toBe(
      'passed'
    );
    let baseline = report.comparisons.find(
      item => item.id === pricingId
    ).baseline;
    let saved = await readFile(
      join(reporter.workingDir, '.vizzly', baseline.replace('/images/', ''))
    );
    let current = report.comparisons.find(
      item => item.id === pricingId
    ).current;
    expect(
      saved.equals(
        await readFile(
          join(reporter.workingDir, '.vizzly', current.replace('/images/', ''))
        )
      )
    ).toBe(true);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${newId}$`));
    report = await reporter.readReport();
    expect(report.comparisons.find(item => item.id === checkoutId).status).toBe(
      'rejected'
    );
    // A new browser session sees the persisted rejection, independent of optimistic state.
    await page.reload();
    let queue = await openQueue();
    await queue.getByRole('button', { name: 'All', exact: true }).click();
    await queue.getByRole('button', { name: /checkout-form/ }).click();
    if (page.viewportSize().width < 640)
      await page
        .getByRole('button', { name: 'Close sidebar', exact: true })
        .click();
    await expect(
      page.getByRole('button', { name: 'Rejected', exact: true })
    ).toBeVisible();
  });

  test('a completed save preserves manual navigation made while it was pending', async ({
    page,
    openReview,
    openQueue,
  }) => {
    await openReview();
    let releaseResponse;
    let responseReady;
    let held = new Promise(resolve => {
      releaseResponse = resolve;
    });
    let ready = new Promise(resolve => {
      responseReady = resolve;
    });
    // Hold delivery of the real server response, without changing its result.
    await page.route('**/api/baseline/accept', async route => {
      let response = await route.fetch();
      responseReady();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await ready;
      let queue = await openQueue();
      await queue.getByRole('button', { name: /dashboard-widget/ }).click();
      await expect(page).toHaveURL(new RegExp(`${newId}$`));
      await page
        .getByRole('button', { name: 'Close sidebar', exact: true })
        .click();
      releaseResponse();
      await expect(
        page.getByRole('button', { name: 'Approve', exact: true })
      ).toBeEnabled();
      await expect(page).toHaveURL(new RegExp(`${newId}$`));
    } finally {
      releaseResponse();
    }
  });

  test('failed approval keeps the current capture open and offers a retry', async ({
    page,
    reporter,
    openReview,
  }) => {
    await openReview();
    let comparison = reporter.data.comparisons.find(
      item => item.id === pricingId
    );
    let path = join(
      reporter.workingDir,
      '.vizzly',
      comparison.current.replace('/images/', '')
    );
    let contents = await readFile(path);
    await rm(path);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not save your review'
    );
    await expect(page).toHaveURL(new RegExp(`${pricingId}$`));
    await expect(
      page.getByRole('button', { name: 'Approve', exact: true })
    ).toBeEnabled();
    await writeFile(path, contents);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
  });

  test('deletion still closes after SSE removes the capture before the response arrives', async ({
    page,
    reporter,
    openReview,
  }) => {
    await openReview(newId);
    let releaseResponse;
    let held = new Promise(resolve => {
      releaseResponse = resolve;
    });
    await page.route('**/api/baseline/delete', async route => {
      let response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page
        .getByRole('button', { name: 'Delete screenshot', exact: true })
        .click();
      await expect(
        page.getByText('Comparison not found', { exact: true })
      ).toBeVisible();
      releaseResponse();
      await expect(page).toHaveURL(`${reporter.url}/`);
    } finally {
      releaseResponse();
    }
  });

  test('delete removes a new capture and returns to the list', async ({
    page,
    reporter,
    openReview,
  }) => {
    await openReview(newId);
    await page
      .getByRole('button', { name: 'Delete screenshot', exact: true })
      .click();
    await expect(page).toHaveURL(`${reporter.url}/`);
    expect(
      (await reporter.readReport()).comparisons.some(item => item.id === newId)
    ).toBe(false);
  });
});
