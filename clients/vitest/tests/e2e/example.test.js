/**
 * E2E tests for the Vizzly Vitest plugin
 *
 * Tests the toMatchScreenshot matcher works correctly with:
 * - Page screenshots
 * - Element screenshots
 * - Properties/metadata
 * - Threshold options
 *
 * Uses the shared test-site CSS for consistent styling.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';

// Base URL for test-site assets (defined in vitest.e2e.config.js)
// eslint-disable-next-line no-undef
let baseUrl = __TEST_SITE_URL__;

// Load test-site CSS before all tests
beforeAll(async () => {
  let link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${baseUrl}/dist/output.css`;
  document.head.appendChild(link);

  // Wait for CSS to load
  await new Promise((resolve) => {
    link.onload = resolve;
    link.onerror = resolve;
  });
});

describe('Vizzly Vitest Plugin', () => {
  test('page screenshot', async () => {
    document.body.innerHTML = `
      <div class="p-8 bg-white">
        <h1 class="text-3xl font-bold text-primary-600">Hello Vizzly</h1>
        <p class="text-gray-600 mt-2">Testing the Vitest plugin</p>
      </div>
    `;

    await expect(page).toMatchScreenshot('page.png');
  });

  test('element screenshot', async () => {
    document.body.innerHTML = `
      <div class="p-8">
        <button class="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium">
          Click me
        </button>
      </div>
    `;

    let button = page.getByRole('button');
    await expect(button).toMatchScreenshot('button.png');
  });

  test('screenshot with properties', async () => {
    document.body.innerHTML = `
      <div class="p-8">
        <div class="bg-gray-900 text-white p-6 rounded-xl shadow-lg">
          <h2 class="text-xl font-semibold">Dark Theme Card</h2>
          <p class="text-gray-300 mt-2">Component with metadata</p>
        </div>
      </div>
    `;

    await expect(page).toMatchScreenshot('card.png', {
      properties: {
        theme: 'dark',
        component: 'card',
      },
    });
  });

  test('screenshot with threshold', async () => {
    document.body.innerHTML = `
      <div class="p-8">
        <span class="text-2xl font-bold text-red-500">Warning!</span>
      </div>
    `;

    await expect(page).toMatchScreenshot('warning.png', {
      threshold: 5,
    });
  });

  test('multiple elements in sequence', async () => {
    document.body.innerHTML = `
      <nav class="flex gap-6 p-4 bg-gray-100 rounded-lg">
        <a href="#" class="text-primary-600 font-medium">Home</a>
        <a href="#" class="text-gray-600 hover:text-primary-600">About</a>
        <a href="#" class="text-gray-600 hover:text-primary-600">Contact</a>
      </nav>
    `;

    let nav = page.getByRole('navigation');
    await expect(nav).toMatchScreenshot('nav.png');

    let homeLink = page.getByRole('link', { name: 'Home' });
    await expect(homeLink).toMatchScreenshot('home-link.png');
  });
});
