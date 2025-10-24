# @vizzly-testing/vitest

> Seamless Vitest browser mode integration - use native `toMatchScreenshot` with Vizzly

[![npm version](https://img.shields.io/npm/v/@vizzly-testing/vitest.svg)](https://www.npmjs.com/package/@vizzly-testing/vitest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

This package provides a **screenshot comparator** for Vitest v4's browser mode, allowing you to use Vitest's native `toMatchScreenshot` matcher with [Vizzly](https://vizzly.dev)'s powerful visual testing platform.

**No custom matchers. No new API to learn. Just Vitest + Vizzly.**

## Features

- ✅ **Native Vitest API** - Use `toMatchScreenshot` - no custom matchers!
- 🎨 **Per-Screenshot Properties** - Add metadata for multi-variant testing
- 🏃 **TDD Mode** - Interactive local dashboard with live comparisons
- ☁️ **Cloud Mode** - Team collaboration with visual reviews
- 🚀 **CI/CD Ready** - Parallel execution and baseline management
- 🔬 **Better Diffing** - Powered by honeydiff (Rust-based, faster than pixelmatch)

## Installation

```bash
npm install -D @vizzly-testing/vitest @vizzly-testing/cli vitest @vitest/browser @vitest/browser-playwright
```

## Quick Start

### 1. Configure Vitest

Add the Vizzly plugin to `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config'
import { vizzlyPlugin } from '@vizzly-testing/vitest'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [vizzlyPlugin()],
  test: {
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
          provider: playwright()
        }
      ]
    }
  }
})
```

### 2. Write Tests

Use Vitest's native `toMatchScreenshot` matcher:

```javascript
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

test('homepage looks correct', async () => {
  // Render your component/page
  document.body.innerHTML = '<div class="hero">Hello World</div>'

  // Basic screenshot
  await expect(page.getByRole('heading')).toMatchScreenshot('homepage.png')

  // With custom properties for multi-variant testing
  await expect(page.getByRole('heading')).toMatchScreenshot('hero-section.png', {
    comparatorOptions: {
      properties: {
        theme: 'dark',
        viewport: '1920x1080'
      }
    }
  })
})
```

### 3. Run Tests

**TDD Mode** (local development with live dashboard):

```bash
# Terminal 1: Start Vizzly TDD server
npx vizzly dev start

# Terminal 2: Run tests
npx vitest

# Open dashboard at http://localhost:47392
```

**Cloud Mode** (CI/CD with team collaboration):

```bash
npx vizzly run "npx vitest" --wait
```

## API Reference

### Plugin Options

Configure default options for all screenshots:

```javascript
import { vizzlyPlugin } from '@vizzly-testing/vitest'

vizzlyPlugin({
  threshold: 5,          // Default threshold (0-100)
  properties: {          // Default properties for all screenshots
    project: 'my-app',
    ci: process.env.CI === 'true'
  },
  fullPage: false,       // Default full page capture
  name: 'default-name'   // Default name prefix
})
```

### Per-Screenshot Options

Override defaults per screenshot using `toMatchScreenshot` options:

```javascript
await expect(page).toMatchScreenshot('my-screenshot.png', {
  comparatorOptions: {
    // Vizzly properties for signature matching
    properties: {
      theme: 'dark',
      language: 'en',
      userRole: 'admin'
    },

    // Comparison threshold (0-100, overrides plugin default)
    threshold: 10,

    // Full page capture
    fullPage: true
  }
})
```

## Multi-Variant Testing

Use properties to test the same component in different states:

```javascript
test('button variants', async () => {
  // Light theme
  document.body.classList.add('theme-light')
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    comparatorOptions: {
      properties: { theme: 'light' }
    }
  })

  // Dark theme
  document.body.classList.remove('theme-light')
  document.body.classList.add('theme-dark')
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    comparatorOptions: {
      properties: { theme: 'dark' }
    }
  })
})
```

Vizzly will manage separate baselines for each variant using signature-based matching: `button.png|theme:dark|...`

## How It Works

### TDD Mode

1. Vitest captures screenshot → sends pixel data to comparator
2. Comparator converts to PNG → sends to Vizzly TDD service
3. Vizzly compares using honeydiff → saves results to `.vizzly/`
4. Dashboard shows live results at `http://localhost:47392/dashboard`
5. Accept/reject changes in UI → baselines updated

### Cloud Mode

1. Vitest captures screenshot → sends pixel data to comparator
2. Comparator converts to PNG → queues for upload
3. After tests complete → uploads to Vizzly cloud
4. Team reviews changes in web dashboard
5. Comparisons happen in cloud with full collaboration features

## TypeScript

Full TypeScript support included! The plugin automatically extends Vitest's types:

```typescript
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

test('typed screenshot', async () => {
  await expect(page).toMatchScreenshot('hero.png', {
    comparatorOptions: {
      properties: {
        // Full autocomplete support
        theme: 'dark',
        viewport: '1920x1080'
      },
      threshold: 5,
      fullPage: true
    }
  })
})
```

## Comparison with Direct Integration

You can also use Vizzly without the comparator by calling `vizzlyScreenshot()` directly:

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client'

test('manual screenshot', async () => {
  let screenshot = await page.screenshot()
  await vizzlyScreenshot('homepage', screenshot, {
    properties: { theme: 'dark' }
  })
})
```

**Comparator approach (this package):**
- ✅ Native Vitest API (`toMatchScreenshot`)
- ✅ Integrated with Vitest's snapshot management
- ✅ Less verbose test code

**Direct approach:**
- ✅ Full control over screenshot capture
- ✅ Works with any test runner
- ✅ More explicit

## Examples & Tests

See the integration tests at [tests/integration/vitest-plugin](../../tests/integration/vitest-plugin):

- **vitest-plugin.spec.js** - Unit tests for plugin configuration and comparator function
- **e2e/** - End-to-end test project running actual Vitest tests with the plugin

The E2E tests serve as both validation and a working example. Run them with:

```bash
cd tests/integration/vitest-plugin/e2e
npm install
npx vizzly dev start  # Terminal 1
npx vitest            # Terminal 2
```

## Troubleshooting

### "Vizzly not available" message

Make sure you're running tests with either:
- `vizzly dev start` (TDD mode)
- `vizzly run "npx vitest"` (cloud mode)

### Screenshots not appearing in dashboard

1. Check that `.vizzly/server.json` exists (TDD mode)
2. Verify API token is set: `npx vizzly whoami`
3. Check console for error messages

### TypeScript errors

Make sure `vitest` and `@vitest/browser` are installed as dev dependencies.

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
