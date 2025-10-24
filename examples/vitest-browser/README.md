# Vitest Browser Mode + Vizzly Integration Example

This example demonstrates the **seamless integration** between Vizzly and Vitest v4's browser mode. Use Vitest's native `toMatchScreenshot` matcher - Vizzly works behind the scenes!

## Overview

Vitest v4 introduced native browser mode with visual testing support. Vizzly integrates as a **custom screenshot comparator**, providing:

- ✅ **Native Vitest API** - Use `toMatchScreenshot` - no custom matchers!
- 🏃 **Local TDD Mode** - Interactive dashboard with accept/reject UI
- ☁️ **Cloud Mode** - Team collaboration on visual changes
- 🚀 **CI/CD Ready** - Parallel execution and baseline management
- 🔧 **Rich Metadata** - Add custom properties for organization

## Setup

### 1. Install Dependencies

```bash
npm install -D vitest @vitest/browser playwright @vizzly-testing/vitest @vizzly-testing/cli
```

### 2. Configure Vitest

Create `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config'
import { vizzlyComparator } from '@vizzly-testing/vitest'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',

      // Configure Vizzly as the screenshot comparator
      screenshotOptions: {
        comparator: vizzlyComparator
      }
    }
  }
})
```

### 3. Write Tests

**Use Vitest's native matcher - that's it!**

```javascript
import { expect, test } from 'vitest'
import { page } from '@vitest/browser/context'

test('homepage looks correct', async () => {
  await page.goto('https://example.com')

  // Vitest's native matcher - Vizzly handles comparison!
  await expect(page).toMatchScreenshot('homepage.png')
})
```

## Running Tests

### TDD Mode (Local Development)

Start the TDD server in one terminal:

```bash
npx vizzly tdd start
```

Run your tests in watch mode in another terminal:

```bash
npx vitest
```

View results at http://localhost:47392/dashboard

### CI/CD Mode

Run with the `vizzly run` command:

```bash
npx vizzly run "npx vitest run" --wait
```

This will:
1. Start the screenshot server
2. Run your tests
3. Upload screenshots to Vizzly cloud
4. Wait for comparison results
5. Return exit code (0 = pass, 1 = visual differences)

## API Reference

### Using Vizzly Comparator

**Basic Usage:**

```javascript
// vitest.config.js
import { vizzlyComparator } from '@vizzly-testing/vitest'

export default defineConfig({
  test: {
    browser: {
      screenshotOptions: {
        comparator: vizzlyComparator
      }
    }
  }
})
```

**With Default Options:**

```javascript
import { createVizzlyComparator } from '@vizzly-testing/vitest'

const comparator = createVizzlyComparator({
  threshold: 0.01,  // 1% default threshold
  properties: {
    project: 'my-app',
    ci: process.env.CI === 'true'
  }
})

export default defineConfig({
  test: {
    browser: {
      screenshotOptions: {
        comparator
      }
    }
  }
})
```

**Using Plugin (Auto-Configuration):**

```javascript
import { vizzlyPlugin } from '@vizzly-testing/vitest'

export default defineConfig({
  plugins: [vizzlyPlugin()],
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright'
    }
  }
})
```

### Writing Tests

**Full Page Screenshot:**

```javascript
test('full page', async () => {
  await page.goto('/')
  await expect(page).toMatchScreenshot('homepage.png', {
    fullPage: true
  })
})
```

**Element Screenshot:**

```javascript
test('element screenshot', async () => {
  const hero = page.getByTestId('hero')
  await expect(hero).toMatchScreenshot('hero-section.png')
})
```

**With Threshold:**

```javascript
test('with threshold', async () => {
  await expect(page).toMatchScreenshot('dashboard.png', {
    threshold: 0.02  // Allow 2% difference
  })
})
```

**With Custom Properties (Vizzly-Specific):**

```javascript
test('with metadata', async () => {
  await expect(page).toMatchScreenshot('checkout.png', {
    vizzly: {
      properties: {
        userType: 'guest',
        cart: 'empty',
        variant: 'default'
      }
    }
  })
})
```

## Configuration

### Global Screenshot Options

```javascript
export default defineConfig({
  test: {
    browser: {
      screenshotOptions: {
        comparator: vizzlyComparator,

        // Global threshold (0-1)
        threshold: 0.01,

        // Global Vizzly properties
        vizzly: {
          properties: {
            browser: 'chromium',
            ci: process.env.CI === 'true'
          }
        }
      }
    }
  }
})
```

### Via vizzly.config.js

```javascript
import { defineConfig } from '@vizzly-testing/cli/config'

export default defineConfig({
  server: {
    port: 47392
  },
  comparison: {
    threshold: 0.01
  }
})
```

### Via Environment Variables

```bash
VIZZLY_TOKEN=your_token          # For cloud mode
VIZZLY_ENABLED=true              # Enable/disable
VIZZLY_LOG_LEVEL=debug           # Logging level
```

## Examples

### Multi-Step Workflow

```javascript
test('checkout flow', async () => {
  await page.goto('/cart')
  await expect(page).toMatchScreenshot('checkout-step-1.png')

  await page.getByRole('button', { name: 'Checkout' }).click()
  await expect(page).toMatchScreenshot('checkout-step-2.png')
})
```

### Responsive Design

```javascript
test('responsive homepage', async () => {
  const viewports = [
    { width: 375, height: 667, name: 'mobile' },
    { width: 1920, height: 1080, name: 'desktop' }
  ]

  for (const vp of viewports) {
    await page.setViewportSize(vp)
    await page.goto('/')

    await expect(page).toMatchScreenshot(`homepage-${vp.name}.png`, {
      vizzly: {
        properties: { viewport: `${vp.width}x${vp.height}` }
      }
    })
  }
})
```

### Conditional Screenshots

```javascript
import { getVizzlyStatus } from '@vizzly-testing/vitest'

test('my test', async () => {
  await page.goto('/')

  if (getVizzlyStatus().ready) {
    await expect(page).toMatchScreenshot('conditional.png')
  }
})
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Visual Tests
on: [push, pull_request]

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npx playwright install chromium

      - name: Run visual tests
        run: npx vizzly run "npx vitest run" --wait
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

### Parallel Execution

```yaml
jobs:
  visual-tests:
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - run: |
          npx vizzly run "npx vitest run --shard=${{ matrix.shard }}" \
            --parallel-id="${{ github.run_id }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}

  finalize:
    needs: visual-tests
    steps:
      - run: npx vizzly finalize "${{ github.run_id }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Why This Integration is Seamless

| Aspect | Traditional Approach | Vizzly Integration |
|--------|---------------------|-------------------|
| Matcher API | Custom matcher | ✅ Native `toMatchScreenshot` |
| Learning curve | New API to learn | ✅ Standard Vitest API |
| Migration | Rewrite tests | ✅ Drop-in replacement |
| Configuration | Multiple steps | ✅ One-line config |
| Features | Basic comparison | ✅ TDD + Cloud + Team collab |

## Troubleshooting

### Screenshots not being compared

- **TDD Mode**: Start server with `npx vizzly tdd start`
- **CI Mode**: Wrap command with `npx vizzly run "npx vitest run"`
- Check `getVizzlyStatus().ready` returns `true`

### Comparator not found

- Verify `@vizzly-testing/vitest` is installed
- Check import in `vitest.config.js`
- Ensure comparator is set in `screenshotOptions`

### Browser not launching

```bash
# Install Playwright browsers
npx playwright install chromium
```

## Next Steps

- Read the [Vizzly TDD Mode Guide](../../docs/tdd-mode.md)
- Explore [Test Integration](../../docs/test-integration.md)
- Check out the [API Reference](../../docs/api-reference.md)
