import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { vizzlyScreenshot } from '../../../dist/client/index.js';
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

  test('view current settings values', async ({ page, browserName }) => {
    await page.goto(`http://localhost:${port}/settings`);

    // Verify page loaded
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();

    // Verify settings cards are visible
    await expect(
      page.getByRole('heading', { name: 'Comparison', level: 3 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Server', level: 3 })
    ).toBeVisible();

    // Verify threshold shows default value (spinbutton with value 2)
    let thresholdInput = page.getByRole('spinbutton').first();
    await expect(thresholdInput).toHaveValue('2');

    // Verify port shows default value
    await expect(page.getByText('47392')).toBeVisible();

    // 📸 Settings page
    await vizzlyScreenshot(
      'settings-page',
      await page.screenshot({ fullPage: true }),
      { browser: browserName, viewport: page.viewportSize() }
    );
  });

  test('update threshold and save', async ({ page }) => {
    await page.goto(`http://localhost:${port}/settings`);

    // Get the threshold input (first spinbutton on page)
    let thresholdInput = page.getByRole('spinbutton').first();

    // Change threshold value
    await thresholdInput.fill('0.5');

    // Verify save button is now enabled
    let saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).toBeEnabled();

    // Click Save Changes
    await saveButton.click();

    // Verify success message (the toast) - this confirms the save completed
    await expect(page.getByText('Settings saved successfully!')).toBeVisible();

    // Verify the value persists by reloading and checking the input still has new value
    await page.reload();
    await expect(thresholdInput).toHaveValue('0.5');
  });

  test('reset reverts unsaved changes', async ({ page }) => {
    await page.goto(`http://localhost:${port}/settings`);

    // Get the threshold input (first spinbutton on page)
    let thresholdInput = page.getByRole('spinbutton').first();
    let originalValue = await thresholdInput.inputValue();

    // Change threshold value
    await thresholdInput.fill('0.1');

    // Verify value changed
    await expect(thresholdInput).toHaveValue('0.1');

    // Reset button should now be enabled
    let resetButton = page.getByRole('button', { name: 'Reset' });
    await expect(resetButton).toBeEnabled();

    // Click Reset
    await resetButton.click();

    // Verify value reverted
    await expect(thresholdInput).toHaveValue(originalValue);

    // Verify reset button is disabled again
    await expect(resetButton).toBeDisabled();
  });
});
