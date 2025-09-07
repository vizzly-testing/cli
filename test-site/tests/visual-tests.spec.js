import { test, expect } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';

test.describe('FluffyCloud SAAS - Visual Tests', () => {

  test('Homepage - Multiple views and interactions', async ({ page, browserName }) => {
    // Desktop view - full page
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Every Pet Deserves');

    const desktopScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('homepage-full', desktopScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'full-page'
    });

    // Desktop view - above fold only
    const aboveFoldScreenshot = await page.screenshot({ fullPage: false });
    await vizzlyScreenshot('homepage-hero', aboveFoldScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'above-fold'
    });

    // Desktop view - scroll to middle section if exists
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    const midSectionScreenshot = await page.screenshot({ fullPage: false });
    await vizzlyScreenshot('homepage-mid', midSectionScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'scrolled-middle'
    });

    // Tablet landscape view
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    const tabletLandscapeScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('homepage-full', tabletLandscapeScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'full-page'
    });

    // Tablet portrait view
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletPortraitScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('homepage-full', tabletPortraitScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'full-page'
    });

    // Mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('h1')).toContainText('Every Pet Deserves');
    
    const mobileScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('homepage-full', mobileScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'full-page'
    });

    // Mobile landscape view
    await page.setViewportSize({ width: 812, height: 375 });
    const mobileLandscapeScreenshot = await page.screenshot({ fullPage: false });
    await vizzlyScreenshot('homepage-full', mobileLandscapeScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      state: 'full-page'
    });
  });

  test('Features Page - Desktop and Mobile', async ({ page, browserName }) => {
    // Desktop full page
    await page.goto('/features.html');
    await expect(page.locator('h1')).toBeVisible();

    const desktopScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('features-full', desktopScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      state: 'full-page'
    });

    // Desktop above fold
    const aboveFoldScreenshot = await page.screenshot({ fullPage: false });
    await vizzlyScreenshot('features-hero', aboveFoldScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      state: 'above-fold'
    });

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('features-full', tabletScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      state: 'full-page'
    });

    // Mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    const mobileScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('features-full', mobileScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features',
      state: 'full-page'
    });
  });

  test('Pricing Page - Multiple states and viewports', async ({ page, browserName }) => {
    // Desktop - Monthly view
    await page.goto('/pricing.html');
    await expect(page.locator('h1')).toBeVisible();

    const monthlyDesktopScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('pricing-full', monthlyDesktopScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      state: 'monthly'
    });

    // Check if there's a yearly/annual toggle and click it
    const yearlyToggle = page.locator('button:has-text("Yearly"), button:has-text("Annual"), [data-testid="yearly-toggle"]').first();
    if (await yearlyToggle.count() > 0) {
      await yearlyToggle.click();
      await page.waitForTimeout(500); // Wait for animation
      
      const yearlyDesktopScreenshot = await page.screenshot({ fullPage: true });
      await vizzlyScreenshot('pricing-full', yearlyDesktopScreenshot, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: 'pricing',
        state: 'yearly'
      });
    }

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('pricing-full', tabletScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      state: 'monthly'
    });

    // Mobile view - pricing cards often stack vertically
    await page.setViewportSize({ width: 375, height: 812 });
    const mobileScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('pricing-full', mobileScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      state: 'monthly'
    });

    // Mobile - capture just the first pricing card if visible
    const firstCard = page.locator('.pricing-card, .price-card, [data-testid="pricing-card"]').first();
    if (await firstCard.count() > 0) {
      await firstCard.scrollIntoViewIfNeeded();
      const cardScreenshot = await page.screenshot({ fullPage: false });
      await vizzlyScreenshot('pricing-card', cardScreenshot, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: 'pricing',
        state: 'monthly-card-focus'
      });
    }
  });

  test('Contact Page - Form states and viewports', async ({ page, browserName }) => {
    // Desktop - Empty form
    await page.goto('/contact.html');
    await expect(page.locator('h1')).toBeVisible();

    const emptyFormScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('contact-form', emptyFormScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      state: 'empty'
    });

    // Desktop - Focus state on first input
    const firstInput = page.locator('input[type="text"], input[type="email"]').first();
    if (await firstInput.count() > 0) {
      await firstInput.focus();
      const focusScreenshot = await page.screenshot({ fullPage: false });
      await vizzlyScreenshot('contact-form-focus', focusScreenshot, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: 'contact',
        state: 'input-focus'
      });
    }

    // Desktop - Partially filled form
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    
    if (await nameInput.count() > 0) {
      await nameInput.fill('John Doe');
    }
    if (await emailInput.count() > 0) {
      await emailInput.fill('john@example.com');
    }
    
    const partialFormScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('contact-form', partialFormScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      state: 'partially-filled'
    });

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('contact-form', tabletScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      state: 'partially-filled'
    });

    // Mobile view - empty form
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload(); // Reset form
    const mobileEmptyScreenshot = await page.screenshot({ fullPage: true });
    await vizzlyScreenshot('contact-form', mobileEmptyScreenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      state: 'empty'
    });

    // Mobile - keyboard visible (if we can trigger it)
    const mobileInput = page.locator('input').first();
    if (await mobileInput.count() > 0) {
      await mobileInput.focus();
      await page.waitForTimeout(300); // Wait for keyboard animation
      const keyboardScreenshot = await page.screenshot({ fullPage: false });
      await vizzlyScreenshot('contact-form-keyboard', keyboardScreenshot, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: 'contact',
        state: 'keyboard-visible'
      });
    }
  });


});
