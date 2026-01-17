/**
 * E2E Integration Tests using shared test-site (FluffyCloud)
 *
 * These tests verify the Vitest plugin integration with Vizzly using
 * the same test-site as other SDKs for visual consistency.
 *
 * Uses custom commands to navigate Playwright to the test-site URLs.
 *
 * Local TDD mode:
 *   vizzly tdd start
 *   npm run test:e2e
 *
 * One-shot TDD mode:
 *   npm run test:e2e:tdd
 */

import { describe, expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';

// Base URL for test-site (defined in vitest.e2e.config.js)
// eslint-disable-next-line no-undef
let baseUrl = __TEST_SITE_URL__;

describe('Homepage', () => {
  test('full page screenshot', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    await expect(page).toMatchScreenshot('homepage-full.png');
  });

  test('navigation bar', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    let nav = page.getByRole('navigation');
    await expect(nav).toMatchScreenshot('homepage-nav.png');
  });

  test('hero section', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    // Get hero by heading text
    let hero = page.getByRole('heading', { name: 'Every Pet Deserves' });
    await expect(hero).toMatchScreenshot('homepage-hero.png');
  });

  test('features heading', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    // Get features section heading
    let featuresHeading = page.getByRole('heading', { name: 'Why Choose FluffyCloud?' });
    await expect(featuresHeading).toMatchScreenshot('homepage-features-heading.png');
  });
});

describe('Features Page', () => {
  test('full page screenshot', async () => {
    await commands.loadPage(`${baseUrl}/features.html`);
    await expect(page).toMatchScreenshot('features-full.png');
  });

  test('navigation bar', async () => {
    await commands.loadPage(`${baseUrl}/features.html`);
    let nav = page.getByRole('navigation');
    await expect(nav).toMatchScreenshot('features-nav.png');
  });
});

describe('Pricing Page', () => {
  test('full page screenshot', async () => {
    await commands.loadPage(`${baseUrl}/pricing.html`);
    await expect(page).toMatchScreenshot('pricing-full.png');
  });

  test('pricing heading', async () => {
    await commands.loadPage(`${baseUrl}/pricing.html`);
    // Get the pricing section heading
    let pricingHeading = page.getByRole('heading', { level: 1 });
    await expect(pricingHeading).toMatchScreenshot('pricing-heading.png');
  });
});

describe('Contact Page', () => {
  test('full page screenshot', async () => {
    await commands.loadPage(`${baseUrl}/contact.html`);
    await expect(page).toMatchScreenshot('contact-full.png');
  });

  test('contact heading', async () => {
    await commands.loadPage(`${baseUrl}/contact.html`);
    let heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toMatchScreenshot('contact-heading.png');
  });
});

describe('Screenshot Options', () => {
  test('with custom threshold', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    let nav = page.getByRole('navigation');
    await expect(nav).toMatchScreenshot('threshold-test.png', {
      threshold: 5,
    });
  });

  test('with properties', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    await expect(page).toMatchScreenshot('props-test.png', {
      properties: {
        browser: 'chromium',
        viewport: '1280x720',
        page: 'homepage',
      },
    });
  });

  test('element with threshold and properties', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    let nav = page.getByRole('navigation');
    await expect(nav).toMatchScreenshot('combined-options.png', {
      threshold: 3,
      properties: {
        component: 'navigation',
        variant: 'default',
      },
    });
  });
});

describe('Cross-Page Navigation', () => {
  test('captures multiple pages in sequence', async () => {
    let pages = ['index.html', 'features.html', 'pricing.html', 'contact.html'];

    for (let pageName of pages) {
      await commands.loadPage(`${baseUrl}/${pageName}`);
      let nav = page.getByRole('navigation');
      await expect(nav).toMatchScreenshot(`nav-${pageName.replace('.html', '')}.png`, {
        properties: { page: pageName },
      });
    }
  });
});

describe('Footer', () => {
  test('footer brand on homepage', async () => {
    await commands.loadPage(`${baseUrl}/index.html`);
    // Get footer by text
    let footerBrand = page.getByText('FluffyCloud', { exact: false }).last();
    await expect(footerBrand).toMatchScreenshot('footer-brand.png');
  });
});
