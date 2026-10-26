import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reportFixture('empty-state') });

test.describe('Sign-in requests', () => {
  test('Back and a fresh attempt ignore a delayed code from the old attempt', async ({
    page,
    openLogin,
    cloud,
  }) => {
    let held = cloud.defer();
    let initiate = cloud.initiate;
    cloud.initiate = async count => {
      if (count === 1) {
        held.requested();
        await held.waiting;
      }
      return initiate(count);
    };
    await openLogin();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await held.started;
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
    let finished = page.waitForResponse('**/api/auth/login');
    held.release();
    await (await finished).finished();
    await page.getByRole('button', { name: 'Check Status' }).click();
    await expect(
      page.getByRole('button', { name: 'Check Status' })
    ).toBeEnabled();
    await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
    expect(cloud.starts).toBe(2);
  });

  test('duplicate status checks share one request while the check is pending', async ({
    page,
    openLogin,
    cloud,
  }) => {
    let held = cloud.defer();
    cloud.poll = async () => {
      held.requested();
      await held.waiting;
      return { body: { status: 'pending' } };
    };
    await openLogin();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Check Status' })
      .evaluate(button => {
        button.click();
        button.click();
      });
    await held.started;
    await expect(
      page.getByRole('button', { name: 'Check Status' })
    ).toBeDisabled();
    held.release();
    await expect(
      page.getByRole('button', { name: 'Check Status' })
    ).toBeEnabled();
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    expect(cloud.checks).toBe(1);
  });

  test('a delayed status check cannot replace a new login after Back', async ({
    page,
    openLogin,
    cloud,
  }) => {
    let held = cloud.defer();
    cloud.poll = async count => {
      if (count === 1) {
        held.requested();
        await held.waiting;
        return { body: { status: 'denied' } };
      }
      return { body: { status: 'pending' } };
    };
    await openLogin();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Check Status' }).click();
    await held.started;
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
    let response = page.waitForResponse('**/api/auth/poll');
    held.release();
    await (await response).finished();
    await page.getByRole('button', { name: 'Check Status' }).click();
    await expect(
      page.getByRole('button', { name: 'Check Status' })
    ).toBeEnabled();
    await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Try Again' })
    ).not.toBeVisible();
    expect(cloud.starts).toBe(2);
    expect(cloud.checks).toBe(2);
  });
});
