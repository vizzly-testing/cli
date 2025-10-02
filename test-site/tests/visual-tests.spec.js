import { test, expect } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';

test.describe('FluffyCloud SAAS - Visual Tests', () => {

  test('Homepage', async ({ page, browserName }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Every Pet Deserves');

    // Desktop
    await vizzlyScreenshot('homepage-desktop', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('h1')).toBeVisible();
    await vizzlyScreenshot('homepage-mobile', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });
  });

  test('Features Page', async ({ page, browserName }) => {
    await page.goto('/features.html', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();

    // Desktop
    await vizzlyScreenshot('features-desktop', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('h1')).toBeVisible();
    await vizzlyScreenshot('features-mobile', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });
  });

  test('Pricing Page', async ({ page, browserName }) => {
    await page.goto('/pricing.html', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();

    // Desktop
    await vizzlyScreenshot('pricing-desktop', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('h1')).toBeVisible();
    await vizzlyScreenshot('pricing-mobile', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });
  });

  test('Contact Page', async ({ page, browserName }) => {
    await page.goto('/contact.html', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();

    // Desktop
    await vizzlyScreenshot('contact-desktop', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('h1')).toBeVisible();
    await vizzlyScreenshot('contact-mobile', await page.screenshot({ fullPage: true }), {
      browser: browserName,
      viewport: page.viewportSize(),
    });
  });

});
