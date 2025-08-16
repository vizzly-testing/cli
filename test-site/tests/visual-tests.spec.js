import { test } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';

test.describe('FluffyCloud SaaS - Visual Tests', () => {

  test('Homepage - Full page', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });

    await vizzlyScreenshot('homepage-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      type: 'full-page'
    });
  });

  test('Homepage - Hero section', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const heroSection = await page.locator('.hero').screenshot();

    await vizzlyScreenshot('homepage-hero', heroSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      section: 'hero',
      type: 'component'
    });
  });

  test('Pricing Page - Plans comparison', async ({ page, browserName }) => {
    await page.goto('/pricing.html');
    await page.waitForLoadState('networkidle');

    const plansSection = await page.locator('.plans-container').screenshot();

    await vizzlyScreenshot('pricing-plans', plansSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      section: 'plans',
      type: 'component',
      feature: 'pricing-comparison'
    });
  });

  test('Pricing Page - Toggle interaction', async ({ page, browserName }) => {
    await page.goto('/pricing.html');
    await page.waitForLoadState('networkidle');

    // Simple toggle click demo
    await page.click('.slider');

    const plansSection = await page.locator('.plans-container').screenshot();
    await vizzlyScreenshot('pricing-toggle-demo', plansSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      section: 'plans',
      type: 'interaction'
    });
  });

  test('Features Page - Feature spotlight', async ({ page, browserName }) => {
    await page.goto('/features.html');
    await page.waitForLoadState('networkidle');

    const spotlightSection = await page.locator('.feature-spotlight').screenshot();

    await vizzlyScreenshot('features-spotlight', spotlightSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      section: 'spotlight',
      type: 'component',
      feature: 'key-feature-display'
    });
  });

  test('Contact Form - Empty state', async ({ page, browserName }) => {
    await page.goto('/contact.html');
    await page.waitForLoadState('networkidle');

    const formSection = await page.locator('.contact-form-section').screenshot();

    await vizzlyScreenshot('contact-form-empty', formSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      section: 'form',
      state: 'empty',
      type: 'form'
    });
  });

  test('Contact Form - Filled state', async ({ page, browserName }) => {
    await page.goto('/contact.html');
    await page.waitForLoadState('networkidle');

    // Fill form for demonstration
    await page.fill('#name', 'Sarah Johnson');
    await page.fill('#petName', 'Whiskers');
    await page.fill('#email', 'sarah@example.com');
    await page.selectOption('#subject', 'support');
    await page.fill('#message', 'I love how FluffyCloud keeps my pet data secure!');

    const formSection = await page.locator('.contact-form-section').screenshot();

    await vizzlyScreenshot('contact-form-filled', formSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      section: 'form',
      state: 'filled',
      type: 'form'
    });
  });

  test('Navigation - Header consistency', async ({ page, browserName }) => {
    const pages = [
      { path: '/', name: 'home' },
      { path: '/features.html', name: 'features' },
      { path: '/pricing.html', name: 'pricing' },
      { path: '/contact.html', name: 'contact' }
    ];

    for (const { path, name } of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const header = await page.locator('header').screenshot();

      await vizzlyScreenshot(`header-${name}`, header, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: name,
        section: 'header',
        type: 'navigation',
        feature: 'header-consistency'
      });
    }
  });
});
