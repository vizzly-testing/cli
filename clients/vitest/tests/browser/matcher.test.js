import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

let scenario = import.meta.env.TEST_SCENARIO;
let properties = { url: 'https://example.test/visual-test' };

if (scenario === 'disabled') {
  test('passes without capturing when no Vizzly server is available', async () => {
    await expect(null).toMatchScreenshot('disabled');
  });
} else {
  test('captures the page with metadata and comparison options', async () => {
    document.body.innerHTML = '<h1>Hello Vizzly</h1>';
    await expect(page).toMatchScreenshot('page', {
      properties: { ...properties, theme: 'light' },
      fullPage: true,
      threshold: 5,
      minClusterSize: 10,
    });
  });

  test('captures an element', async () => {
    document.body.innerHTML =
      '<button style="width:200px;height:100px">Save</button>';
    await expect(page.getByRole('button', { name: 'Save' })).toMatchScreenshot(
      'button',
      { properties, fullPage: true }
    );
  });

  if (scenario.startsWith('tdd')) {
    test('fails on a diff by default and respects the screenshot override', async () => {
      document.body.innerHTML =
        '<div style="width:200px;height:100px;background:black"></div>';
      await expect(page).toMatchScreenshot('changing-page', { properties });

      document.body.firstElementChild.style.background = 'white';
      await expect(
        expect(page).toMatchScreenshot('changing-page', { properties })
      ).rejects.toThrow('Visual difference detected: changing-page');

      await expect(page).toMatchScreenshot('changing-page', {
        properties,
        failOnDiff: false,
      });
    });
  }
}
