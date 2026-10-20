import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

test.describe('Builds Workflow', () => {
  let fixtureData;
  let port = 3474;

  test.beforeAll(() => {
    fixtureData = JSON.parse(
      readFileSync(join(fixturesDir, 'empty-state.json'), 'utf8')
    );
  });

  test('signed-out users do not fetch projects', async ({ page }) => {
    let server = createReporterTestServer(fixtureData, port, {
      authenticated: false,
    });
    await server.start();

    try {
      await page.goto(`http://localhost:${port}/builds`);
      await expect(
        page.getByRole('heading', { name: /sign in required/i })
      ).toBeVisible();

      let requestLogResponse = await page.request.get(
        `http://localhost:${port}/__test__/requests`
      );
      let requestLog = await requestLogResponse.json();
      let projectRequests = requestLog.requests.filter(
        request => request.path === '/api/projects'
      );

      expect(projectRequests.length).toBe(0);
    } finally {
      await server.stop();
    }
  });

  test('signed-in users fetch projects', async ({ page }) => {
    let server = createReporterTestServer(fixtureData, port, {
      authenticated: true,
    });
    await server.start();

    try {
      await page.goto(`http://localhost:${port}/builds`);
      await expect(
        page.getByRole('heading', { name: /remote builds/i })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: /no projects found/i })
      ).toBeVisible();

      let requestLogResponse = await page.request.get(
        `http://localhost:${port}/__test__/requests`
      );
      let requestLog = await requestLogResponse.json();
      let projectRequests = requestLog.requests.filter(
        request => request.path === '/api/projects'
      );

      expect(projectRequests.length).toBeGreaterThan(0);
    } finally {
      await server.stop();
    }
  });
  async function loginPage(page, options = {}) {
    let server = createReporterTestServer(fixtureData, port);
    let starts = 0;
    let checks = 0;
    let authenticated = false;
    await server.start();
    await page.route('**/api/auth/status', route =>
      route.fulfill({
        json: {
          authenticated,
          user: authenticated ? { username: 'test-user' } : null,
        },
      })
    );
    await page.route('**/api/auth/login', async route => {
      starts++;
      if (options.initiate) return options.initiate(route, starts);
      await route.fulfill({
        json: {
          deviceCode: `device-${starts}`,
          userCode: `CODE-${starts}`,
          verificationUri: 'https://auth.test/cli/authorize',
          expiresIn: 600,
          interval: 5,
        },
      });
    });
    await page.route('**/api/auth/poll', async route => {
      checks++;
      let result = options.poll
        ? await options.poll(route, checks)
        : { status: 'pending' };
      if (!result) return;
      if (result.status === 'complete') authenticated = true;
      await route.fulfill({ json: result });
    });
    await page.goto(`http://localhost:${port}/builds`);
    await expect(
      page.getByRole('button', { name: 'Sign In', exact: true })
    ).toBeVisible();
    return {
      server,
      get starts() {
        return starts;
      },
      get checks() {
        return checks;
      },
    };
  }

  test('one action creates one stable code across duplicate input and pending rerenders', async ({
    page,
  }) => {
    let state = await loginPage(page);
    try {
      await page
        .getByRole('button', { name: 'Sign In', exact: true })
        .evaluate(button => {
          button.click();
          button.click();
        });
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      for (let check = 0; check < 3; check++) {
        let request = page.waitForResponse('**/api/auth/poll');
        await page.getByRole('button', { name: 'Check Status' }).click();
        await request;
        await expect(
          page.getByRole('button', { name: 'Check Status' })
        ).toBeEnabled();
        await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      }
      expect(state.starts).toBe(1);
      expect(state.checks).toBe(3);
    } finally {
      await state.server.stop();
    }
  });

  test('Back and a fresh attempt ignore a delayed response from the old attempt', async ({
    page,
  }) => {
    let release;
    let waiting = new Promise(resolve => {
      release = resolve;
    });
    let state = await loginPage(page, {
      initiate: async (route, count) => {
        if (count === 1) await waiting;
        await route.fulfill({
          json: {
            deviceCode: `device-${count}`,
            userCode: `CODE-${count}`,
            verificationUri: 'https://auth.test/cli/authorize',
          },
        });
      },
    });
    try {
      let started = page.waitForRequest('**/api/auth/login');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await started;
      await page.getByRole('button', { name: /Back/ }).click();
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
      let finished = page.waitForResponse('**/api/auth/login');
      release();
      await (await finished).finished();
      await page.getByRole('button', { name: 'Check Status' }).click();
      await expect(
        page.getByRole('button', { name: 'Check Status' })
      ).toBeEnabled();
      await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
      expect(state.starts).toBe(2);
    } finally {
      release();
      await state.server.stop();
    }
  });

  test('duplicate status checks share one request while the current check is pending', async ({
    page,
  }) => {
    let release;
    let waiting = new Promise(resolve => {
      release = resolve;
    });
    let state = await loginPage(page, {
      poll: async () => {
        await waiting;
        return { status: 'pending' };
      },
    });
    try {
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      let requested = page.waitForRequest('**/api/auth/poll');
      await page
        .getByRole('button', { name: 'Check Status' })
        .evaluate(button => {
          button.click();
          button.click();
        });
      await requested;
      await expect(
        page.getByRole('button', { name: 'Check Status' })
      ).toBeDisabled();
      let response = page.waitForResponse('**/api/auth/poll');
      release();
      await (await response).finished();
      await expect(
        page.getByRole('button', { name: 'Check Status' })
      ).toBeEnabled();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      expect(state.checks).toBe(1);
    } finally {
      release();
      await state.server.stop();
    }
  });

  test('a delayed status check cannot replace a new login after Back', async ({
    page,
  }) => {
    let release;
    let waiting = new Promise(resolve => {
      release = resolve;
    });
    let state = await loginPage(page, {
      poll: async (_route, count) => {
        if (count === 1) {
          await waiting;
          return { status: 'denied' };
        }
        return { status: 'pending' };
      },
    });
    try {
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      let requested = page.waitForRequest('**/api/auth/poll');
      await page.getByRole('button', { name: 'Check Status' }).click();
      await requested;
      await page.getByRole('button', { name: /Back/ }).click();
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
      let response = page.waitForResponse('**/api/auth/poll');
      release();
      await (await response).finished();
      await page.getByRole('button', { name: 'Check Status' }).click();
      await expect(
        page.getByRole('button', { name: 'Check Status' })
      ).toBeEnabled();
      await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Try Again' })
      ).not.toBeVisible();
      expect(state.starts).toBe(2);
      expect(state.checks).toBe(2);
    } finally {
      release();
      await state.server.stop();
    }
  });

  for (let status of ['denied', 'expired', 'invalid']) {
    test(`${status} requires an explicit new login`, async ({ page }) => {
      let state = await loginPage(page, { poll: async () => ({ status }) });
      try {
        await page
          .getByRole('button', { name: 'Sign In', exact: true })
          .click();
        await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Check Status' }).click();
        await expect(
          page.getByRole('button', { name: 'Try Again' })
        ).toBeVisible();
        expect(state.starts).toBe(1);
        await page.getByRole('button', { name: 'Try Again' }).click();
        await expect(page.getByText('CODE-2', { exact: true })).toBeVisible();
        expect(state.starts).toBe(2);
      } finally {
        await state.server.stop();
      }
    });
  }

  test('a recoverable check error retains the code and successful retry signs in', async ({
    page,
  }) => {
    let state = await loginPage(page, {
      poll: async (route, count) => {
        if (count === 1) {
          await route.fulfill({
            status: 503,
            json: { error: 'Temporarily unavailable' },
          });
          return null;
        }
        return { status: 'complete', user: { username: 'test-user' } };
      },
    });
    try {
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check Status' }).click();
      await expect(page.getByText('Temporarily unavailable')).toBeVisible();
      await expect(page.getByText('CODE-1', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check Status' }).click();
      await expect(
        page.getByRole('heading', { name: /remote builds/i })
      ).toBeVisible();
      expect(state.starts).toBe(1);
    } finally {
      await state.server.stop();
    }
  });

  test('rate-limited initiation shows retry timing and does not restart automatically', async ({
    page,
  }) => {
    let state = await loginPage(page, {
      initiate: route =>
        route.fulfill({
          status: 429,
          json: { error: 'Too many login attempts', retryAfter: 73 },
        }),
    });
    try {
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByText(/Try again after 73 seconds/)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Try Again' })
      ).toBeVisible();
      expect(state.starts).toBe(1);
    } finally {
      await state.server.stop();
    }
  });
});
