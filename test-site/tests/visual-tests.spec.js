import { test } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';

test.describe('FluffyCloud SAAS - Visual Tests', () => {

  test('Homepage - Desktop view', async ({ page, browserName }) => {
    await page.goto('/');

    const screenshot = await page.screenshot({ fullPage: true });

    await vizzlyScreenshot('homepage-desktop', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      type: 'desktop-view'
    });
  });

  test('Features Page - Full page', async ({ page, browserName }) => {
    await page.goto('/features.html');

    const screenshot = await page.screenshot({ fullPage: true });

    await vizzlyScreenshot('features-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      type: 'full-page'
    });
  });

  test('Pricing Page - Monthly view', async ({ page, browserName }) => {
    await page.goto('/pricing.html');

    const screenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('pricing-monthly', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      state: 'monthly',
      type: 'pricing-plans'
    });
  });

  test('Contact Page - Full page', async ({ page, browserName }) => {
    await page.goto('/contact.html');

    const screenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('contact-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      type: 'full-page'
    });
  });

  test('Mobile View - Homepage', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.goto('/');

    const screenshot = await page.screenshot({ fullPage: true });

    await vizzlyScreenshot('homepage-mobile', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      type: 'mobile-view'
    });
  });

});
