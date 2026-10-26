import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reportFixture('empty-state') });

test.describe('Settings Workflow', () => {
  test('view current settings values', async ({ page, reporter, capture }) => {
    await page.goto(`${reporter.url}/settings`);

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
    await capture('settings-page');
  });

  test('update threshold and save', async ({ page, reporter }) => {
    await page.goto(`${reporter.url}/settings`);

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
    expect((await reporter.readConfig()).comparison.threshold).toBe(0.5);
    await page.reload();
    await expect(thresholdInput).toHaveValue('0.5');
  });

  test('reset reverts unsaved changes', async ({ page, reporter }) => {
    await page.goto(`${reporter.url}/settings`);

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

  test('save is disabled while numeric fields are invalid', async ({
    page,
    reporter,
  }) => {
    await page.goto(`${reporter.url}/settings`);

    let thresholdInput = page.getByRole('spinbutton').first();
    let saveButton = page.getByRole('button', { name: 'Save Changes' });

    await thresholdInput.fill('');
    await expect(
      page.getByText('Threshold must be a number greater than or equal to 0.')
    ).toBeVisible();
    await expect(saveButton).toBeDisabled();

    await thresholdInput.fill('1.5');
    await expect(
      page.getByText('Threshold must be a number greater than or equal to 0.')
    ).not.toBeVisible();
    await expect(saveButton).toBeEnabled();
  });
});
