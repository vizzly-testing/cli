import { authorizedResponse } from '../support/cloud-api.js';
import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reportFixture('empty-state') });

test.describe('Sign in', () => {
  test('pending checks keep the same code until authorization succeeds', async ({
    page,
    openLogin,
    cloud,
    reporter,
  }) => {
    cloud.poll = async count =>
      count < 4 ? { body: { status: 'pending' } } : authorizedResponse;
    await openLogin();
    await page
      .getByRole('button', { name: 'Sign In', exact: true })
      .evaluate(button => {
        button.click();
        button.click();
      });
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    for (let check = 0; check < 3; check++) {
      let response = page.waitForResponse('**/api/auth/poll');
      await page.getByRole('button', { name: 'Check Status' }).click();
      await response;
      await expect(
        page.getByRole('button', { name: 'Check Status' })
      ).toBeEnabled();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Check Status' }).click();
    await expect(
      page.getByRole('heading', { name: /no projects found/i })
    ).toBeVisible();
    expect((await reporter.readAuth()).user.username).toBe('test-user');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /no projects found/i })
    ).toBeVisible();
    expect(cloud.starts).toBe(1);
    expect(cloud.checks).toBe(4);
  });

  for (let [status, code] of [
    ['denied', 'ACCESS_DENIED'],
    ['expired', 'EXPIRED_TOKEN'],
    ['invalid', 'INVALID_DEVICE_CODE'],
  ]) {
    test(`${status} requires an explicit new login`, async ({
      page,
      openLogin,
      cloud,
    }) => {
      cloud.poll = async () => ({
        status: 400,
        body: { code, error: `Authorization ${status}` },
      });
      await openLogin();
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check Status' }).click();
      await expect(
        page.getByRole('button', { name: 'Try Again' })
      ).toBeVisible();
      expect(cloud.starts).toBe(1);
      await page.getByRole('button', { name: 'Try Again' }).click();
      await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
      expect(cloud.starts).toBe(2);
    });
  }

  test('a recoverable check error retains the code and successful retry signs in', async ({
    page,
    openLogin,
    cloud,
  }) => {
    cloud.poll = async count =>
      count === 1
        ? { status: 503, body: { error: 'Temporarily unavailable' } }
        : authorizedResponse;
    await openLogin();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Check Status' }).click();
    await expect(page.getByText(/Temporarily unavailable/)).toBeVisible();
    await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Check Status' }).click();
    await expect(
      page.getByRole('heading', { name: /no projects found/i })
    ).toBeVisible();
    expect(cloud.starts).toBe(1);
  });

  test('rate-limited initiation shows retry timing and waits for another action', async ({
    page,
    openLogin,
    cloud,
  }) => {
    cloud.initiate = async () => ({
      status: 429,
      body: { error: 'Too many login attempts', retryAfter: 73 },
    });
    await openLogin();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText(/Try again after 73 seconds/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    expect(cloud.starts).toBe(1);
  });
});
