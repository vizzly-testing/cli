/**
 * E2E Integration Tests
 *
 * These tests verify the Vitest plugin integration with Vizzly.
 * They also serve as examples for documentation.
 *
 * Local TDD mode:
 *   vizzly tdd start
 *   npm run test:e2e
 *
 * Cloud mode (used in CI):
 *   vizzly run "npm run test:e2e"
 */

import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

test('homepage matches screenshot', async () => {
  // Render the hero HTML directly
  // eslint-disable-next-line no-undef
  document.body.innerHTML = `
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .hero {
        text-align: center;
        color: white;
        padding: 3rem;
      }
      h1 {
        font-size: 3rem;
        margin: 0 0 1rem 0;
      }
      p {
        font-size: 1.25rem;
        opacity: 0.9;
      }
    </style>
    <div class="hero">
      <h1>Vizzly + Vitest</h1>
      <p>Visual regression testing made simple</p>
    </div>
  `;

  await expect(page.getByRole('heading')).toMatchScreenshot('homepage.png');
});

test('homepage with properties', async () => {
  // Render the hero HTML directly
  // eslint-disable-next-line no-undef
  document.body.innerHTML = `
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .hero {
        text-align: center;
        color: white;
        padding: 3rem;
      }
      h1 {
        font-size: 3rem;
        margin: 0 0 1rem 0;
      }
      p {
        font-size: 1.25rem;
        opacity: 0.9;
      }
    </style>
    <div class="hero">
      <h1>Vizzly + Vitest</h1>
      <p>Visual regression testing made simple</p>
    </div>
  `;

  // New first-class API - properties at top level!
  await expect(page.getByRole('heading')).toMatchScreenshot(
    'homepage-with-props.png',
    {
      properties: {
        theme: 'dark',
        viewport: '1920x1080',
      },
      threshold: 5,
    }
  );
});
