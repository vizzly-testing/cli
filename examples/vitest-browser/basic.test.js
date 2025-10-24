/**
 * Basic Vitest + Vizzly Example
 *
 * Uses Vitest's NATIVE toMatchScreenshot matcher with Vizzly as the comparator.
 * No custom matchers needed - it's completely seamless!
 *
 * Run with:
 *   TDD mode: npx vizzly tdd start && npx vitest
 *   CI mode:  npx vizzly run "npx vitest run" --wait
 */

import { expect, test } from 'vitest';
import { page } from '@vitest/browser/context';

test('full page screenshot', async () => {
  await page.goto('https://example.com');

  // Use Vitest's native matcher - Vizzly handles comparison!
  await expect(page).toMatchScreenshot('example-homepage.png', {
    fullPage: true,
  });
});

test('element screenshot', async () => {
  await page.goto('https://example.com');

  // Capture specific element using Vitest's standard API
  await expect(page.getByRole('heading', { level: 1 })).toMatchScreenshot(
    'example-heading.png'
  );
});

test('screenshot with custom properties', async () => {
  await page.goto('https://example.com');

  // Add custom Vizzly metadata
  await expect(page).toMatchScreenshot('example-with-metadata.png', {
    vizzly: {
      properties: {
        page: 'homepage',
        section: 'above-fold',
        device: 'desktop',
      },
    },
  });
});

test('screenshot with threshold', async () => {
  await page.goto('https://example.com');

  // Allow small pixel differences (useful for dynamic content)
  await expect(page).toMatchScreenshot('example-with-threshold.png', {
    threshold: 0.02, // Allow 2% difference
  });
});
