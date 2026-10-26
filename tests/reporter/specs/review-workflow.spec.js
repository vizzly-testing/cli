import { expect, test } from '../support/reporter-test.js';

test.describe('Review Workflow', () => {
  test('user can open a screenshot and see the fullscreen viewer', async ({
    page,
    reporter,
    capture,
  }) => {
    await page.goto(`${reporter.url}/`);

    // User sees screenshot groups on the dashboard
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();

    // 📸 Dashboard with mixed state
    await capture('dashboard-mixed-state');

    // User clicks on a screenshot to open it
    await page.getByText('pricing-page').first().click();

    // Fullscreen viewer opens
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // User sees the screenshot name in the header
    await expect(
      page.getByRole('heading', { name: /pricing-page/i })
    ).toBeVisible();

    // User sees approve and reject buttons
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();

    // 📸 Fullscreen viewer
    await capture('fullscreen-viewer');
  });

  test('user can close fullscreen viewer with Escape key', async ({
    page,
    reporter,
  }) => {
    await page.goto(`${reporter.url}/`);

    // Open a screenshot
    await page.getByText('pricing-page').first().click();
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Viewer is closed
    await expect(page.getByTestId('fullscreen-viewer')).not.toBeVisible();
  });

  test('user can accept all changes via bulk action', async ({
    page,
    reporter,
    capture,
  }) => {
    await page.goto(`${reporter.url}/`);

    // User sees the Accept All button with count
    let acceptAllButton = page.getByRole('button', { name: /Accept All/i });
    await expect(acceptAllButton).toBeVisible();

    // User clicks Accept All
    await acceptAllButton.click();

    // Confirmation dialog appears
    await expect(
      page.getByText('Accept all changes as new baselines?')
    ).toBeVisible();

    // 📸 Bulk accept confirmation dialog
    await capture('bulk-accept-dialog');

    // User confirms
    await page.getByRole('button', { name: 'OK' }).click();

    // Success message appears
    await expect(
      page.getByText('All baselines accepted successfully')
    ).toBeVisible();
    expect(
      (await reporter.readReport()).comparisons.every(
        comparison => comparison.status === 'passed'
      )
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('button', { name: /Accept All/i })
    ).not.toBeVisible();
  });

  test('user can cancel bulk accept', async ({ page, reporter }) => {
    let before = await reporter.readReport();
    await page.goto(`${reporter.url}/`);

    // Click Accept All
    await page.getByRole('button', { name: /Accept All/i }).click();

    // Confirmation dialog appears
    await expect(
      page.getByText('Accept all changes as new baselines?')
    ).toBeVisible();

    // User cancels
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Dialog closes, Accept All button still visible
    await expect(
      page.getByText('Accept all changes as new baselines?')
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: /Accept All/i })
    ).toBeVisible();
    expect(await reporter.readReport()).toEqual(before);
  });
});
