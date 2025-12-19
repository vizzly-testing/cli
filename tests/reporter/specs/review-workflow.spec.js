import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Review Workflow E2E Tests
 *
 * Tests the core user journey: reviewing visual differences and accepting/rejecting baselines.
 * Uses the mixed-state fixture which contains passed, failed, and new comparisons.
 */
test.describe('Review Workflow', () => {
  let server;
  let fixtureData;
  let port = 3470;

  test.beforeAll(() => {
    fixtureData = JSON.parse(
      readFileSync(join(fixturesDir, 'mixed-state.json'), 'utf8')
    );
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

  test('user can open a screenshot and see the fullscreen viewer', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);

    // User sees screenshot groups on the dashboard
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();

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
  });

  test('user can close fullscreen viewer with Escape key', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // Open a screenshot
    await page.getByText('pricing-page').first().click();
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Viewer is closed
    await expect(page.getByTestId('fullscreen-viewer')).not.toBeVisible();
  });

  test('user can accept all changes via bulk action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // User sees the Accept All button with count
    let acceptAllButton = page.getByRole('button', { name: /Accept All/i });
    await expect(acceptAllButton).toBeVisible();

    // User clicks Accept All
    await acceptAllButton.click();

    // Confirmation dialog appears
    await expect(
      page.getByText('Accept all changes as new baselines?')
    ).toBeVisible();

    // User confirms
    await page.getByRole('button', { name: 'OK' }).click();

    // Success message appears
    await expect(
      page.getByText('All baselines accepted successfully')
    ).toBeVisible();
  });

  test('user can cancel bulk accept', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

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
  });
});
