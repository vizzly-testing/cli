import { test, expect } from '@playwright/test';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test.describe('FluffyCloud Marketing Site Visual Tests', () => {
  
  test('Homepage - Full page', async ({ page, browserName }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of full page
    const screenshot = await page.screenshot({ fullPage: true });
    
    await vizzlyScreenshot('homepage-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage'
    });
  });

  test('Homepage - Hero section', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Screenshot just the hero section
    const heroSection = await page.locator('.hero').screenshot();
    
    await vizzlyScreenshot('homepage-hero', heroSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      section: 'hero'
    });
  });

  test('Pricing Page - Full page', async ({ page, browserName }) => {
    await page.goto('/pricing.html');
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    
    await vizzlyScreenshot('pricing-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing'
    });
  });

  test('Pricing Page - Pricing plans section', async ({ page, browserName }) => {
    await page.goto('/pricing.html');
    await page.waitForLoadState('networkidle');
    
    // Screenshot the pricing plans
    const plansSection = await page.locator('.plans-container').screenshot();
    
    await vizzlyScreenshot('pricing-plans', plansSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      section: 'plans'
    });
  });

  test('Pricing Page - Yearly toggle interaction', async ({ page, browserName }) => {
    await page.goto('/pricing.html');
    await page.waitForLoadState('networkidle');
    
    // Toggle to yearly billing by clicking the slider (the input is hidden)
    await page.click('.slider');
    await page.waitForTimeout(500); // Wait for animation
    
    const plansSection = await page.locator('.plans-container').screenshot();
    
    await vizzlyScreenshot('pricing-yearly-toggle', plansSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'pricing',
      section: 'plans-yearly'
    });
  });

  test('Features Page - Full page', async ({ page, browserName }) => {
    await page.goto('/features.html');
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    
    await vizzlyScreenshot('features-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'features'
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
      section: 'spotlight'
    });
  });

  test('Contact Page - Full page', async ({ page, browserName }) => {
    await page.goto('/contact.html');
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    
    await vizzlyScreenshot('contact-full', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact'
    });
  });

  test('Contact Page - Contact form', async ({ page, browserName }) => {
    await page.goto('/contact.html');
    await page.waitForLoadState('networkidle');
    
    const formSection = await page.locator('.contact-form-section').screenshot();
    
    await vizzlyScreenshot('contact-form', formSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      section: 'form'
    });
  });

  test('Contact Page - Form with data', async ({ page, browserName }) => {
    await page.goto('/contact.html');
    await page.waitForLoadState('networkidle');
    
    // Fill out the form
    await page.fill('#name', 'Test User');
    await page.fill('#petName', 'Fluffy McTestface');
    await page.fill('#email', 'test@example.com');
    await page.selectOption('#subject', 'feedback');
    await page.fill('#message', 'This is a test message to see how the form looks when filled out!');
    await page.check('#newsletter');
    
    const formSection = await page.locator('.contact-form-section').screenshot();
    
    await vizzlyScreenshot('contact-form-filled', formSection, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'contact',
      section: 'form-filled'
    });
  });

  test('Navigation - Header across pages', async ({ page, browserName }) => {
    const pages = ['/', '/features.html', '/pricing.html', '/contact.html'];
    
    for (const pagePath of pages) {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');
      
      const header = await page.locator('header').screenshot();
      const pageName = pagePath === '/' ? 'home' : pagePath.replace('.html', '').replace('/', '');
      
      await vizzlyScreenshot(`header-${pageName}`, header, {
        browser: browserName,
        viewport: page.viewportSize(),
        page: pageName,
        section: 'header'
      });
    }
  });

  test('Responsive - Mobile navigation', async ({ page, browserName }) => {
    // Only run on mobile viewport
    if (page.viewportSize().width > 768) {
      test.skip();
      return;
    }
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const header = await page.locator('header').screenshot();
    
    await vizzlyScreenshot('mobile-navigation', header, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: 'homepage',
      section: 'mobile-nav'
    });
  });

  test('Error state simulation', async ({ page, browserName }) => {
    // Test a non-existent page to capture 404 styling
    await page.goto('/nonexistent-page.html');
    
    const screenshot = await page.screenshot({ fullPage: true });
    
    await vizzlyScreenshot('404-page', screenshot, {
      browser: browserName,
      viewport: page.viewportSize(),
      page: '404'
    });
  });
});