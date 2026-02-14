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
});
