/**
 * Advanced Vitest + Vizzly Example
 *
 * Demonstrates advanced patterns using Vitest's native toMatchScreenshot matcher
 * with Vizzly's powerful comparison engine.
 */

import { expect, test } from 'vitest';
import { page } from '@vitest/browser/context';
import { getVizzlyStatus } from '@vizzly-testing/vitest';

test('multi-step user flow', async () => {
  // Example: screenshot each step of a workflow
  await page.goto('https://example.com');
  await expect(page).toMatchScreenshot('flow-step-1-landing.png');

  // Simulate navigation
  const aboutLink = page.getByRole('link', { name: /about/i });
  if ((await aboutLink.count()) > 0) {
    await aboutLink.click();
    await expect(page).toMatchScreenshot('flow-step-2-about.png');
  }
});

test('conditional screenshot based on Vizzly availability', async () => {
  await page.goto('https://example.com');

  // Check if Vizzly is ready
  const status = getVizzlyStatus();

  if (status.ready) {
    // Vizzly is available - take screenshot
    await expect(page).toMatchScreenshot('conditional-screenshot.png');
  } else {
    console.log('Skipping screenshot - Vizzly not available');
  }

  // Continue with other test logic...
  expect(await page.title()).toBeTruthy();
});

test('responsive design screenshots', async () => {
  // Test different viewport sizes
  const viewports = [
    { width: 375, height: 667, name: 'mobile' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1920, height: 1080, name: 'desktop' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    await page.goto('https://example.com');

    await expect(page).toMatchScreenshot(`responsive-${viewport.name}.png`, {
      vizzly: {
        properties: {
          viewport: `${viewport.width}x${viewport.height}`,
          device: viewport.name,
        },
      },
    });
  }
});

test('screenshot different states', async () => {
  await page.goto('https://example.com');

  // Initial state
  await expect(page).toMatchScreenshot('state-initial.png');

  const heading = page.getByRole('heading').first();

  // Hover state (if applicable)
  await heading.hover();
  await expect(heading).toMatchScreenshot('state-hover.png');
});

test('component variants with metadata', async () => {
  await page.goto('https://example.com');

  // Capture with rich metadata for organization
  await expect(page).toMatchScreenshot('homepage-full.png', {
    fullPage: true,
    vizzly: {
      properties: {
        component: 'page',
        variant: 'homepage',
        state: 'default',
        userType: 'anonymous',
        theme: 'light',
      },
    },
  });
});

test('element screenshot with custom name', async () => {
  await page.goto('https://example.com');

  // You can use descriptive names without .png extension
  const mainContent = page.locator('body');
  await expect(mainContent).toMatchScreenshot('main-content-section.png', {
    vizzly: {
      properties: {
        section: 'main',
        layout: 'default',
      },
    },
  });
});
