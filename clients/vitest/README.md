# @vizzly-testing/vitest

> Drop-in replacement for Vitest visual testing - powered by Vizzly

[![package version](https://img.shields.io/npm/v/@vizzly-testing/vitest.svg)](https://www.npmjs.com/package/@vizzly-testing/vitest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

This package **completely replaces** Vitest's native visual testing with
[Vizzly](https://vizzly.dev)'s powerful platform. Just add the plugin and continue using Vitest's
standard `toMatchScreenshot` API - no code changes required!

**True drop-in replacement. Zero API changes. Maximum power.**

## Features

- ✅ **Native Vitest API** - Use `toMatchScreenshot` - no custom matchers!
- 🎨 **Per-Screenshot Properties** - Add metadata for multi-variant testing
- 🏃 **TDD Mode** - Interactive local dashboard with live comparisons
- ☁️ **Cloud Mode** - Team collaboration with visual reviews
- 🚀 **CI/CD Ready** - Parallel execution and baseline management
- 🔬 **Better Diffing** - Powered by honeydiff (Rust-based, faster than pixelmatch)

## Installation

```bash
pnpm install -D @vizzly-testing/vitest @vizzly-testing/cli vitest @vitest/browser @vitest/browser-playwright
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

Use Vitest's native `toMatchScreenshot` matcher - **no changes needed**:

```javascript
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

test('homepage looks correct', async () => {
  // Render your component/page
  document.body.innerHTML = '<h1 class="hero">Hello World</h1>'

  // Basic screenshot
  await expect(page.getByRole('heading')).toMatchScreenshot('homepage.png')

  // With properties for multi-variant testing
  await expect(page.getByRole('heading')).toMatchScreenshot('hero-section.png', {
    properties: {
      theme: 'dark'
    },
    threshold: 5
  })
})
```

### 3. Run Tests

**TDD Mode** (local development with live dashboard):

```bash
# Terminal 1: Start Vizzly TDD server
pnpm exec vizzly tdd start

# Terminal 2: Run tests
pnpm exec vitest

# Open dashboard at http://localhost:47392
```

**Note:** New screenshots automatically create baselines on first run and pass! You can review them
in the dashboard at `http://localhost:47392/dashboard`. Future runs will compare against the
baseline.

**Cloud Mode** (CI/CD with team collaboration):

```bash
pnpm exec vizzly run "pnpm exec vitest" --wait
```

## API Reference

### Plugin

The plugin does not take configuration today. Add it once to your Vitest
plugins list and pass screenshot-specific options to `toMatchScreenshot`.

```javascript
import { vizzlyPlugin } from '@vizzly-testing/vitest'

// Simple - just add the plugin
vizzlyPlugin()
```

### Screenshot Options

All options are passed directly to `toMatchScreenshot`:

```javascript
await expect(page).toMatchScreenshot('screenshot.png', {
  // Custom properties for multi-variant testing
  properties: {
    theme: 'dark',
    language: 'en',
    userRole: 'admin'
  },

  // Vizzly diff sensitivity threshold
  threshold: 5,

  // Ignore tiny connected pixel clusters
  minClusterSize: 10,

  // Full page capture
  fullPage: true
})
```

**Available Options:**

- Playwright/Vitest screenshot options such as `animations`, `caret`, `mask`,
  `maskColor`, `omitBackground`, `scale`, and `timeout` are passed through to
  the browser screenshot capture.
- Vizzly automatically adds `browser`, `url`, `viewport`, `viewport_width`, and
  `viewport_height` metadata based on the current browser session.
- `properties` (object) - Custom metadata for signature-based baseline matching.
  Reserved runtime fields stay pinned to the current browser session; explicit
  viewport fields are still allowed when a test intentionally needs a custom
  signature.
- `threshold` (number) - Vizzly diff sensitivity threshold. When omitted, the Vizzly server configuration is used.
- `minClusterSize` (number) - Ignore connected diff clusters smaller than this size
- `fullPage` (boolean) - Capture full scrollable page instead of viewport. This applies to page targets; locator targets stay element-sized.
- `failOnDiff` (boolean) - Fail this assertion when Vizzly reports a visual diff. When omitted, the Vizzly server or environment setting is used.

## Multi-Variant Testing

Use properties to test the same component in different states:

```javascript
test('button variants', async () => {
  // Light theme
  document.body.classList.add('theme-light')
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    properties: { theme: 'light' }
  })

  // Dark theme
  document.body.classList.remove('theme-light')
  document.body.classList.add('theme-dark')
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    properties: { theme: 'dark' }
  })
})
```

Vizzly will manage separate baselines for each variant using signature-based matching: `button.png|theme:dark|...`

## How It Works

This plugin **completely replaces** Vitest's native screenshot testing by:

1. **Extending `expect` API** - Registers a custom `toMatchScreenshot` matcher that overrides Vitest's
2. **Disabling native system** - Sets `screenshotFailures: false` to prevent conflicts
3. **Direct HTTP communication** - Screenshots POST directly to Vizzly server from browser context

### TDD Mode

1. Plugin injects setup file that extends `expect` with custom matcher
2. Your test calls `toMatchScreenshot` → captures screenshot in browser
3. Matcher POSTs screenshot to local Vizzly TDD server
4. Server compares using honeydiff → returns pass/fail result
5. Dashboard shows live results at `http://localhost:47392/dashboard`
6. Accept/reject changes in UI → baselines updated in `.vizzly/baselines/`

### Cloud Mode

1. Same custom matcher captures screenshot in browser
2. POSTs to Vizzly server which queues for upload
3. After tests complete → uploads to Vizzly cloud
4. Team reviews changes in web dashboard
5. **Tests always pass** - comparison happens asynchronously in cloud (use `--wait` flag to fail on visual changes)

## TypeScript

Full TypeScript support included! The plugin automatically extends Vitest's types:

```typescript
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

test('typed screenshot', async () => {
  await expect(page).toMatchScreenshot('hero.png', {
    properties: {
      // Full autocomplete support
      theme: 'dark'
    },
    threshold: 5,
    fullPage: true
  })
})
```

## Vizzly Direct Integration

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

**Direct approach:**
- ✅ Full control over screenshot capture
- ✅ Works with any test runner
- ✅ More explicit

## Examples & Tests

See the package tests in the Vizzly CLI repo under `clients/vitest/tests/`:

- **vitest-plugin.spec.js** - Unit tests for plugin configuration and comparator function
- **e2e/** - End-to-end test project running actual Vitest tests with the plugin

The E2E tests serve as both validation and a working example. Run them with:

```bash
# From clients/vitest directory
pnpm install
pnpm run test:unit    # Run unit tests
pnpm run test:e2e     # Run E2E tests (requires vizzly tdd start)
pnpm test            # Run unit tests
```

## Troubleshooting

### "Vizzly not available" message

Make sure you're running tests with either:
- `vizzly tdd start` (TDD mode)
- `vizzly run "pnpm exec vitest"` (cloud mode)

### Screenshots not appearing in dashboard

1. Check `pnpm exec vizzly tdd status` for TDD, make sure `VIZZLY_TOKEN` is set for cloud capture
2. Verify API token is set: `pnpm exec vizzly whoami`
3. Check console for error messages

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
