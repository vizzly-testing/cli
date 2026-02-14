import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

test.describe('Status Handling', () => {
  let server;
  let fixtureData;
  let port = 3473;

  test.beforeAll(() => {
    let mixedState = JSON.parse(
      readFileSync(join(fixturesDir, 'mixed-state.json'), 'utf8')
    );

    fixtureData = {
      ...mixedState,
      comparisons: [
        ...mixedState.comparisons,
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
  });

  test.beforeEach(async () => {
    server = createReporterTestServer(fixtureData, port);
    await server.start();
  });

  test.afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  test('baseline-created is treated as a new comparison in filters and actions', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);

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
