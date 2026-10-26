import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reportFixture('empty-state') });

test('signed-out users see the sign-in prompt without fetching projects', async ({
  page,
  reporter,
  cloud,
}) => {
  await page.goto(`${reporter.url}/builds`);
  await expect(
    page.getByRole('heading', { name: /sign in required/i })
  ).toBeVisible();
  expect(cloud.requests.some(request => request.path === '/api/project')).toBe(
    false
  );
});

test.describe('Signed-in builds', () => {
  test.use({ signedIn: true });

  test('saved credentials load projects through the real server', async ({
    page,
    reporter,
    cloud,
  }) => {
    await page.goto(`${reporter.url}/builds`);
    await expect(
      page.getByRole('heading', { name: /remote builds/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /no projects found/i })
    ).toBeVisible();
    expect(
      cloud.requests.some(request => request.path === '/api/project')
    ).toBe(true);
  });
});
