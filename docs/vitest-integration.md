# Vitest Browser Mode Integration

Vizzly integrates seamlessly with Vitest v4's browser mode, allowing you to combine Vitest's fast, modern testing experience with Vizzly's powerful visual review platform.

## Why Use Vizzly with Vitest?

Vitest v4 introduced native browser mode with visual testing support. While Vitest provides basic screenshot comparison, Vizzly adds:

- **Interactive TDD Dashboard** - Real-time visual feedback with accept/reject UI
- **Team Collaboration** - Cloud-based visual reviews with your team
- **Advanced Comparison** - High-performance Rust-based image diffing with `honeydiff`
- **CI/CD Ready** - Built-in parallel execution and baseline management
- **Cross-platform** - SHA-based deduplication works across different OS/browsers

## Quick Start

### 1. Install

```bash
npm install -D vitest @vitest/browser playwright @vizzly-testing/cli
```

### 2. Configure Vitest

Create or update `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright'
    },
    setupFiles: ['./vitest-setup.js']
  }
})
```

### 3. Setup Matchers

Create `vitest-setup.js`:

```javascript
import { setupVizzlyMatchers } from '@vizzly-testing/cli/vitest'

setupVizzlyMatchers()
```

### 4. Write Tests

```javascript
import { expect, test } from 'vitest'
import { page } from '@vitest/browser/context'

test('homepage looks correct', async () => {
  await page.goto('/')

  // Full page screenshot
  await expect(page).toMatchVizzlyScreenshot('homepage')

  // Element screenshot
  const hero = page.locator('[data-testid="hero"]')
  await expect(hero).toMatchVizzlyScreenshot('hero-section')
})
```

### 5. Run Tests

**TDD Mode (Local Development):**

Terminal 1:
```bash
npx vizzly tdd start
```

Terminal 2:
```bash
npx vitest
```

Visit http://localhost:47392/dashboard to review changes.

**CI Mode:**

```bash
npx vizzly run "npx vitest run" --wait
```

## API Reference

### Custom Matchers

#### `toMatchVizzlyScreenshot(name, options?)`

Capture and compare a screenshot with Vizzly.

**Syntax:**
```typescript
expect(pageOrLocator).toMatchVizzlyScreenshot(
  name: string,
  options?: {
    threshold?: number,           // 0-100, default: 0
    fullPage?: boolean,           // default: false
    properties?: Record<string, any>,
    screenshotOptions?: object    // Passed to screenshot()
  }
)
```

**Examples:**

```javascript
// Full page
await expect(page).toMatchVizzlyScreenshot('homepage', {
  fullPage: true
})

// Element
await expect(page.locator('.header')).toMatchVizzlyScreenshot('header')

// With threshold
await expect(page).toMatchVizzlyScreenshot('dashboard', {
  threshold: 2  // Allow 2% pixel difference
})

// With metadata
await expect(page).toMatchVizzlyScreenshot('checkout', {
  properties: {
    userType: 'guest',
    cart: 'empty'
  }
})
```

#### `toMatchVizzlySnapshot(name, options?)`

Alias for `toMatchVizzlyScreenshot`. Use whichever feels more semantic.

```javascript
await expect(element).toMatchVizzlySnapshot('button-primary')
```

### Setup Functions

#### `setupVizzlyMatchers(options?)`

Register custom Vizzly matchers. Call this in your Vitest setup file.

**Options:**
- `autoDetect?: boolean` - Auto-detect TDD server (default: true)
- `defaultThreshold?: number` - Default comparison threshold 0-100 (default: 0)
- `fullPage?: boolean` - Capture full page by default (default: false)

**Example:**

```javascript
setupVizzlyMatchers({
  defaultThreshold: 0.1,  // Allow 0.1% difference by default
  fullPage: false         // Element screenshots by default
})
```

### Helper Functions

#### `takeVizzlyScreenshot(page, name, options?)`

Imperative API for taking screenshots without using matchers.

```javascript
import { takeVizzlyScreenshot } from '@vizzly-testing/cli/vitest'

await takeVizzlyScreenshot(page, 'debug-screenshot', {
  fullPage: true,
  properties: { debug: true }
})
```

#### `getVizzlyStatus()`

Get information about Vizzly client state.

**Returns:**
```typescript
{
  enabled: boolean,
  ready: boolean,
  tddMode: boolean,
  serverUrl: string | null
}
```

**Example:**

```javascript
import { getVizzlyStatus } from '@vizzly-testing/cli/vitest'

const status = getVizzlyStatus()
if (status.ready) {
  // Vizzly is available
}
```

#### `vizzlyTest(name, fn)`

Conditional test helper - only runs test if Vizzly is ready.

```javascript
import { vizzlyTest } from '@vizzly-testing/cli/vitest'

vizzlyTest('visual regression', async () => {
  // This test only runs when Vizzly is configured
  await expect(page).toMatchVizzlyScreenshot('test')
})
```

## Usage Patterns

### Multi-Step Workflows

Capture screenshots at each step of a user flow:

```javascript
test('checkout flow', async () => {
  await page.goto('/cart')
  await expect(page).toMatchVizzlyScreenshot('checkout-step-1-cart')

  await page.locator('[data-action="checkout"]').click()
  await expect(page).toMatchVizzlyScreenshot('checkout-step-2-info')

  await page.fill('[name="email"]', 'test@example.com')
  await page.locator('[data-action="continue"]').click()
  await expect(page).toMatchVizzlyScreenshot('checkout-step-3-payment')
})
```

### Responsive Design Testing

Test across multiple viewport sizes:

```javascript
test('responsive homepage', async () => {
  const viewports = [
    { width: 375, height: 667, name: 'mobile' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1920, height: 1080, name: 'desktop' }
  ]

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')

    await expect(page).toMatchVizzlyScreenshot(`homepage-${vp.name}`, {
      properties: {
        viewport: `${vp.width}x${vp.height}`,
        device: vp.name
      }
    })
  }
})
```

### Component Variants

Test all variants of a component:

```javascript
test('button variants', async () => {
  await page.goto('/components/button')

  const variants = ['primary', 'secondary', 'danger']

  for (const variant of variants) {
    const button = page.locator(`[data-variant="${variant}"]`)
    await expect(button).toMatchVizzlyScreenshot(`button-${variant}`, {
      properties: { component: 'button', variant }
    })
  }
})
```

### State Testing

Capture different interaction states:

```javascript
test('button states', async () => {
  const button = page.locator('button').first()

  // Default
  await expect(button).toMatchVizzlyScreenshot('button-default')

  // Hover
  await button.hover()
  await expect(button).toMatchVizzlyScreenshot('button-hover')

  // Focus
  await button.focus()
  await expect(button).toMatchVizzlyScreenshot('button-focus')

  // Active/clicked
  await button.click()
  await expect(button).toMatchVizzlyScreenshot('button-active')
})
```

### Conditional Screenshots

Only capture when Vizzly is available:

```javascript
import { getVizzlyStatus } from '@vizzly-testing/cli/vitest'

test('my test', async () => {
  // Run test logic...
  await page.goto('/')

  // Optionally capture screenshot
  if (getVizzlyStatus().ready) {
    await expect(page).toMatchVizzlyScreenshot('conditional')
  }

  // Continue with assertions...
  expect(await page.title()).toBe('My App')
})
```

## Configuration

### Via vizzly.config.js

```javascript
import { defineConfig } from '@vizzly-testing/cli/config'

export default defineConfig({
  server: {
    port: 47392
  },
  comparison: {
    threshold: 0.01  // 1% global threshold
  },
  tdd: {
    autoAccept: false,
    watchMode: true
  }
})
```

### Via Environment Variables

```bash
# TDD mode (auto-detected when server is running)
VIZZLY_ENABLED=true

# Cloud mode
VIZZLY_TOKEN=your_api_token

# Logging
VIZZLY_LOG_LEVEL=debug

# Server override
VIZZLY_SERVER_URL=http://localhost:3001
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

      # Install Playwright browsers
      - run: npx playwright install chromium

      # Run tests with Vizzly
      - name: Run visual tests
        run: npx vizzly run "npx vitest run" --wait
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

### Parallel Execution

For large test suites, run tests in parallel:

```yaml
jobs:
  visual-tests:
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - name: Run tests (shard ${{ matrix.shard }})
        run: |
          npx vizzly run "npx vitest run --shard=${{ matrix.shard }}" \
            --parallel-id="${{ github.run_id }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}

  finalize:
    needs: visual-tests
    runs-on: ubuntu-latest
    if: always()
    steps:
      - run: npx vizzly finalize "${{ github.run_id }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Comparison: Vizzly vs Native Vitest

| Feature | Vizzly Integration | Native Vitest |
|---------|-------------------|---------------|
| **Local Dashboard** | ✅ Interactive web UI | ❌ CLI only |
| **TDD Mode** | ✅ Real-time feedback | ⚠️ File-based |
| **Team Collaboration** | ✅ Cloud platform | ❌ N/A |
| **CI/CD** | ✅ Built-in support | ⚠️ Manual setup |
| **Parallel Builds** | ✅ Coordinated | ❌ Independent |
| **Baseline Management** | ✅ Automatic | ⚠️ Manual |
| **Cross-platform** | ✅ SHA deduplication | ❌ Platform-specific |
| **Image Comparison** | ✅ honeydiff (Rust) | ⚠️ Built-in |
| **Metadata/Properties** | ✅ Rich metadata | ❌ N/A |
| **Exit Codes** | ✅ CI-friendly | ⚠️ Test framework |

## Troubleshooting

### Matcher not found

**Problem:** `expect(...).toMatchVizzlyScreenshot is not a function`

**Solution:**
- Verify `setupVizzlyMatchers()` is called in your setup file
- Ensure setup file is listed in `vitest.config.js` under `test.setupFiles`

### Screenshots not captured

**Problem:** Screenshots are silently skipped

**Solution:**
- In TDD mode: Start the TDD server with `npx vizzly tdd start`
- In CI mode: Wrap test command with `npx vizzly run "npx vitest run"`
- Check `getVizzlyStatus().ready` returns `true`

### Server connection errors

**Problem:** `ECONNREFUSED` or connection timeout

**Solution:**
- Verify TDD server is running: check for `.vizzly/server.json`
- Check server port matches (default: 47392)
- Ensure no firewall blocking localhost

### Browser not launching

**Problem:** Playwright browser fails to launch

**Solution:**
```bash
# Install browsers
npx playwright install chromium

# Or install all browsers
npx playwright install
```

### Screenshots differ across platforms

**Problem:** Same test produces different screenshots on different OS

**Solution:**
- Use Docker containers for consistent environments
- Use the same OS for all CI runs
- Consider cloud browser services like BrowserStack
- Increase threshold to allow minor rendering differences

## Best Practices

### Screenshot Naming

Use descriptive, hierarchical names:

```javascript
// Good
'homepage-hero-section'
'dashboard-sidebar-user-menu'
'checkout-step-2-payment-form'

// Avoid
'test1'
'screenshot'
'img'
```

### Organizing Tests

Group related visual tests:

```javascript
describe('Header Component', () => {
  test('default state', async () => {
    await expect(header).toMatchVizzlyScreenshot('header-default')
  })

  test('logged in state', async () => {
    await expect(header).toMatchVizzlyScreenshot('header-logged-in')
  })
})
```

### Using Properties

Add rich metadata for organization:

```javascript
await expect(page).toMatchVizzlyScreenshot('dashboard', {
  properties: {
    component: 'dashboard',
    userType: 'admin',
    feature: 'analytics',
    viewport: '1920x1080'
  }
})
```

### Thresholds

Start with strict thresholds (0) and increase only when needed:

```javascript
// Exact match (default)
await expect(page).toMatchVizzlyScreenshot('static-page')

// Allow small differences for dynamic content
await expect(page).toMatchVizzlyScreenshot('dashboard', {
  threshold: 1  // 1% difference allowed
})
```

## Examples

See the complete working example in:
- [`examples/vitest-browser/`](../examples/vitest-browser/)

## Next Steps

- Read about [TDD Mode](./tdd-mode.md) for local development workflow
- Learn about [Test Integration](./test-integration.md) for other frameworks
- Check the [API Reference](./api-reference.md) for detailed API docs
- Explore [Parallel Builds](./test-integration.md#parallel-builds-in-ci) for CI/CD

## Migration from Native Vitest

If you're currently using Vitest's native `toMatchScreenshot`:

```javascript
// Before (native Vitest)
await expect(page.getByTestId('hero')).toMatchScreenshot('hero.png')

// After (with Vizzly)
await expect(page.locator('[data-testid="hero"]')).toMatchVizzlyScreenshot('hero')
```

Key differences:
- Use `toMatchVizzlyScreenshot` instead of `toMatchScreenshot`
- No need for `.png` extension (handled automatically)
- Screenshot name instead of filename
- Richer API with properties and metadata
- Interactive TDD dashboard instead of file-based workflow
