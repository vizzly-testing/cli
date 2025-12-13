import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createReporterTestServer } from '../test-helper.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Settings Workflow E2E Tests
 *
 * Tests the settings view for viewing and updating configuration.
 */
test.describe('Settings Workflow', () => {
  let server;
  let fixtureData;
  let port = 3473;

  test.beforeAll(() => {
    fixtureData = JSON.parse(
      readFileSync(join(fixturesDir, 'empty-state.json'), 'utf8')
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

  test('view current settings values', async ({ page }) => {
    await page.goto(`http://localhost:${port}/settings`, {
      waitUntil: 'networkidle',
    });

    // Verify page loaded
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();

    // Verify General Settings card is visible
    await expect(page.locator('text=General Settings')).toBeVisible();

    // Verify threshold input shows default value
    let thresholdInput = page.getByLabel('Visual Comparison Threshold');
    await expect(thresholdInput).toHaveValue('2');

    // Navigate to Server tab
    await page.getByRole('button', { name: 'Server' }).click();

    // Verify server settings
    await expect(page.locator('text=Server Settings')).toBeVisible();
    let portInput = page.getByLabel('Server Port');
    await expect(portInput).toHaveValue('47392');
  });

  test('update threshold and save', async ({ page }) => {
    await page.goto(`http://localhost:${port}/settings`, {
      waitUntil: 'networkidle',
    });

    // Change threshold value
    let thresholdInput = page.getByLabel('Visual Comparison Threshold');
    await thresholdInput.fill('0.5');

    // Verify save bar appears
    await expect(page.locator('text=Unsaved changes')).toBeVisible();

    // Click Save Changes
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Verify success toast
    await expect(
      page.locator('text=Settings saved successfully')
    ).toBeVisible();

    // Verify mutation was tracked
    let response = await page.request.get(
      `http://localhost:${port}/__test__/mutations`
    );
    let { mutations } = await response.json();
    let configMutation = mutations.find(m => m.type === 'config-update');
    expect(configMutation).toBeDefined();
    expect(configMutation.data.comparison.threshold).toBe(0.5);
  });

  test('reset reverts unsaved changes', async ({ page }) => {
    await page.goto(`http://localhost:${port}/settings`, {
      waitUntil: 'networkidle',
    });

    // Change threshold value
    let thresholdInput = page.getByLabel('Visual Comparison Threshold');
    let originalValue = await thresholdInput.inputValue();
    await thresholdInput.fill('0.1');

    // Verify value changed
    await expect(thresholdInput).toHaveValue('0.1');

    // Click Reset
    await page.getByRole('button', { name: 'Reset' }).click();

    // Verify value reverted
    await expect(thresholdInput).toHaveValue(originalValue);

    // Verify save bar is gone
    await expect(page.locator('text=Unsaved changes')).not.toBeVisible();
  });
});
