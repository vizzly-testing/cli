/**
 * E2E Integration Tests
 *
 * These tests verify the Vitest plugin integration with Vizzly.
 * They cover the full API surface: screenshot capture, properties,
 * threshold, fullPage, element screenshots, etc.
 *
 * IMPORTANT: Vitest browser mode renders content INSIDE the browser sandbox.
 * We use document.body.innerHTML to inject HTML, not page.goto() for external URLs.
 *
 * The page object uses Testing Library style methods:
 * - page.getByRole(), page.getByText(), page.getByTestId(), etc.
 * - Full page screenshots: expect(page).toMatchScreenshot()
 *
 * Local TDD mode:
 *   vizzly tdd start
 *   npm run test:e2e
 *
 * One-shot TDD mode:
 *   npm run test:e2e:tdd
 *
 * Cloud mode (used in CI):
 *   npm run test:e2e:cloud
 */

import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';

// Shared styles used across tests
let baseStyles = `
  body {
    margin: 0;
    font-family: system-ui, -apple-system, sans-serif;
    background: #f8fafc;
  }
  .hero {
    text-align: center;
    padding: 4rem 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
  .hero h1 {
    font-size: 3rem;
    margin: 0 0 1rem 0;
  }
  .hero p {
    font-size: 1.25rem;
    opacity: 0.9;
    margin: 0;
  }
  .btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: white;
    color: #667eea;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 600;
    margin-top: 1.5rem;
    border: none;
    cursor: pointer;
  }
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }
  .card {
    background: white;
    padding: 2rem;
    border-radius: 1rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border: 1px solid #e2e8f0;
  }
  .footer {
    background: #1e293b;
    color: white;
    padding: 2rem;
    text-align: center;
  }
`;

// =============================================================================
// Basic Screenshot Tests
// =============================================================================

describe('Basic Screenshots', () => {
  test('element screenshot - heading', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>FluffyCloud</h1>
        <p>Cloud infrastructure made simple</p>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 1 })).toMatchScreenshot('basic-heading.png');
  });

  test('element screenshot - button', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>FluffyCloud</h1>
        <button class="btn">Get Started</button>
      </div>
    `;

    await expect(page.getByRole('button', { name: 'Get Started' })).toMatchScreenshot('basic-button.png');
  });

  test('element screenshot - paragraph', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>FluffyCloud</h1>
        <p>Cloud infrastructure made simple</p>
      </div>
    `;

    await expect(page.getByText('Cloud infrastructure made simple')).toMatchScreenshot('basic-paragraph.png');
  });
});

// =============================================================================
// Properties Tests
// =============================================================================

describe('Properties', () => {
  test('simple properties', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <nav class="nav">
        <span>FluffyCloud</span>
        <button class="btn">Sign In</button>
      </nav>
    `;

    await expect(page.getByRole('button', { name: 'Sign In' })).toMatchScreenshot('props-simple.png', {
      properties: {
        theme: 'light',
        component: 'navigation',
      },
    });
  });

  test('nested properties', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Properties Test</h1>
      </div>
    `;

    await expect(page.getByRole('heading')).toMatchScreenshot('props-nested.png', {
      properties: {
        browser: 'chromium',
        viewport: { width: 1920, height: 1080 },
        flags: ['responsive', 'desktop'],
      },
    });
  });

  test('empty properties object', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Empty Props</h1>
      </div>
    `;

    await expect(page.getByRole('heading')).toMatchScreenshot('props-empty.png', { properties: {} });
  });
});

// =============================================================================
// Threshold Tests
// =============================================================================

describe('Threshold', () => {
  test('default threshold (0)', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>Pro Plan</h3>
        <p>$29/month - Perfect for growing teams</p>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('threshold-default.png');
  });

  test('custom threshold (5%)', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>Custom Threshold</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('threshold-5.png', { threshold: 5 });
  });

  test('high threshold (10%)', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>High Threshold</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('threshold-10.png', {
      threshold: 10,
      properties: { note: 'high-threshold-for-animations' },
    });
  });

  test('explicit zero threshold', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>Zero Threshold</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('threshold-zero.png', { threshold: 0 });
  });
});

// =============================================================================
// Full Page Screenshots
// =============================================================================

describe('Full Page', () => {
  test('full page screenshot', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <nav class="nav">
        <span>FluffyCloud</span>
      </nav>
      <div class="hero">
        <h1>Cloud Infrastructure</h1>
        <p>Deploy in seconds, scale infinitely</p>
      </div>
      <footer class="footer">
        <p>&copy; 2024 FluffyCloud</p>
      </footer>
    `;

    await expect(page).toMatchScreenshot('fullpage.png', { fullPage: true });
  });

  test('full page with properties', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Full Page Props</h1>
        <p>Testing full page with properties</p>
      </div>
    `;

    await expect(page).toMatchScreenshot('fullpage-props.png', {
      fullPage: true,
      properties: {
        page: 'homepage',
        theme: 'light',
      },
    });
  });

  test('full page with threshold', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Full Page Threshold</h1>
        <p>Testing full page with threshold</p>
      </div>
    `;

    await expect(page).toMatchScreenshot('fullpage-threshold.png', {
      fullPage: true,
      threshold: 2,
    });
  });
});

// =============================================================================
// Combined Options
// =============================================================================

describe('Combined Options', () => {
  test('element with all options', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Combined Test</h1>
        <p>Testing all options together</p>
      </div>
    `;

    await expect(page.getByRole('heading')).toMatchScreenshot('combined-element.png', {
      threshold: 3,
      properties: {
        testType: 'comprehensive',
        browser: 'chromium',
        section: 'hero',
      },
    });
  });

  test('full page with all options', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>Full Page Combined</h1>
        <p>Testing full page with all options</p>
      </div>
    `;

    await expect(page).toMatchScreenshot('combined-fullpage-all.png', {
      fullPage: true,
      threshold: 2,
      properties: {
        viewport: 'desktop',
        theme: 'default',
        page: 'test',
      },
    });
  });
});

// =============================================================================
// Multiple Screenshots Per Test
// =============================================================================

describe('Multiple Screenshots', () => {
  test('captures multiple elements in sequence', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div style="padding: 2rem;">
        <h1>First Heading</h1>
        <h2>Second Heading</h2>
        <h3>Third Heading</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 1 })).toMatchScreenshot('multi-h1.png');
    await expect(page.getByRole('heading', { level: 2 })).toMatchScreenshot('multi-h2.png');
    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('multi-h3.png');
  });

  test('captures different page states', async () => {
    // State 1: Loading
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto; text-align: center;">
        <p>Loading...</p>
      </div>
    `;
    await expect(page.getByText('Loading...')).toMatchScreenshot('state-loading.png');

    // State 2: Loaded
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto; text-align: center;">
        <h3>Content Loaded</h3>
        <p>Your data is ready</p>
      </div>
    `;
    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('state-loaded.png');

    // State 3: Empty
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto; text-align: center;">
        <h3>No Results</h3>
        <p>Try a different search</p>
      </div>
    `;
    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('state-empty.png');
  });
});

// =============================================================================
// Form Elements
// =============================================================================

describe('Form Elements', () => {
  test('form inputs', async () => {
    document.body.innerHTML = `
      <style>
        ${baseStyles}
        .form-input {
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          width: 300px;
          display: block;
          margin: 1rem auto;
        }
      </style>
      <div style="padding: 2rem;">
        <input class="form-input" type="text" placeholder="Enter your name" aria-label="Name">
        <input class="form-input" type="email" placeholder="Enter your email" aria-label="Email">
      </div>
    `;

    await expect(page.getByRole('textbox', { name: 'Name' })).toMatchScreenshot('form-name-input.png');
    await expect(page.getByRole('textbox', { name: 'Email' })).toMatchScreenshot('form-email-input.png');
  });

  test('form buttons', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div style="padding: 2rem; text-align: center;">
        <button class="btn">Submit</button>
        <button class="btn" style="background: #667eea; color: white; margin-left: 1rem;">Cancel</button>
      </div>
    `;

    await expect(page.getByRole('button', { name: 'Submit' })).toMatchScreenshot('form-submit.png');
    await expect(page.getByRole('button', { name: 'Cancel' })).toMatchScreenshot('form-cancel.png');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  test('special characters in screenshot name', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 300px; margin: 2rem auto;">
        <h3>Special Chars</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('screenshot_with-special.chars.png');
  });

  test('very long screenshot name', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 300px; margin: 2rem auto;">
        <h3>Long Name</h3>
      </div>
    `;

    await expect(page.getByRole('heading', { level: 3 })).toMatchScreenshot('this-is-a-very-long-screenshot-name-for-testing-purposes.png');
  });

  test('small text element', async () => {
    document.body.innerHTML = `
      <style>
        .small-text { font-size: 10px; margin: 2rem auto; width: fit-content; }
      </style>
      <span class="small-text">Tiny text</span>
    `;

    await expect(page.getByText('Tiny text')).toMatchScreenshot('edge-small-text.png');
  });

  test('element with emoji', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="hero">
        <h1>🚀 Launch Ready</h1>
      </div>
    `;

    await expect(page.getByRole('heading')).toMatchScreenshot('edge-emoji.png');
  });
});

// =============================================================================
// Test By Data Attribute (using getByTestId)
// =============================================================================

describe('Data Attributes', () => {
  test('getByTestId screenshot', async () => {
    document.body.innerHTML = `
      <style>${baseStyles}</style>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3 data-testid="pricing-title">Enterprise Plan</h3>
        <p data-testid="pricing-amount">$99/month</p>
      </div>
    `;

    await expect(page.getByTestId('pricing-title')).toMatchScreenshot('testid-title.png');
    await expect(page.getByTestId('pricing-amount')).toMatchScreenshot('testid-amount.png');
  });
});
