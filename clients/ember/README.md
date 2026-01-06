# @vizzly-testing/ember

Visual testing SDK for Ember.js projects using Testem. Capture screenshots from your acceptance and integration tests and compare them with Vizzly.

## Installation

```bash
npm install -D @vizzly-testing/ember

# Install a Playwright browser
npx playwright install chromium
```

## Setup

### 1. Configure Testem

Wrap your `testem.js` configuration with the `configure()` function:

```javascript
// testem.js (or testem.cjs for ES modules projects)
const { configure } = require('@vizzly-testing/ember');

module.exports = configure({
  // For Ember with Vite/Embroider, Testem must serve from dist/
  cwd: 'dist',
  test_page: 'tests/index.html?hidepassed',
  disable_watching: true,
  launch_in_ci: ['Chrome'],
  launch_in_dev: ['Chrome'],
});
```

The `configure()` function replaces standard browser launchers (Chrome, Firefox, Safari) with Playwright-powered launchers that can capture screenshots. Browsers run in **headless mode by default**.

> **Note for Ember + Vite projects**: The `cwd: 'dist'` option is required because Vite builds test files into the `dist/` directory. Without this, Testem won't find your test assets.

### 2. Write Tests with Screenshots

Import `vizzlyScreenshot` in your test files:

```javascript
// tests/acceptance/dashboard-test.js
import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Acceptance | Dashboard', function(hooks) {
  setupApplicationTest(hooks);

  test('renders empty state', async function(assert) {
    await visit('/dashboard');

    // Capture screenshot
    await vizzlyScreenshot('dashboard-empty');

    assert.dom('[data-test-empty-state]').exists();
  });

  test('renders with data', async function(assert) {
    // ... setup data
    await visit('/dashboard');

    // Capture specific element
    await vizzlyScreenshot('dashboard-table', {
      selector: '[data-test-data-table]'
    });

    assert.dom('[data-test-data-table]').exists();
  });
});
```

### 3. Run Tests with Vizzly

```bash
# Start the Vizzly TDD server
vizzly tdd start

# Build with development mode (includes test files)
npm run build -- --mode development

# Run your tests via Testem
npx testem ci --file testem.cjs

# Or use ember test (which handles the build)
ember test
```

Screenshots are captured and compared locally. View results in the Vizzly dashboard at http://localhost:47392.

## API

### `configure(testemConfig, playwrightOptions?)`

Wraps your Testem configuration to use Vizzly-powered browser launchers.

```javascript
const { configure } = require('@vizzly-testing/ember');

// Basic - runs headless by default
module.exports = configure({
  launch_in_ci: ['Chrome'],
  launch_in_dev: ['Chrome'],
});

// Headed mode for local debugging
const isCI = process.env.CI;

module.exports = configure({
  launch_in_ci: ['Chrome'],
  launch_in_dev: ['Chrome'],
}, {
  headless: isCI,  // Headed locally, headless in CI
});

// With debugging options
module.exports = configure({
  launch_in_ci: ['Chrome'],
}, {
  headless: false,
  slowMo: 100,     // Slow down for debugging
  timeout: 60000,  // Longer launch timeout
});
```

**Playwright Options:**

The second argument accepts [Playwright browserType.launch() options](https://playwright.dev/docs/api/class-browsertype#browser-type-launch) directly:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headless` | boolean | `true` | Run browser in headless mode |
| `slowMo` | number | - | Slow down operations by specified milliseconds |
| `timeout` | number | - | Maximum time to wait for browser to start |
| `proxy` | object | - | Proxy settings for the browser |
| `args` | string[] | - | Additional browser arguments |

**Browser Mapping:**
- `Chrome` → Uses Playwright Chromium
- `Firefox` → Uses Playwright Firefox
- `Safari` / `WebKit` → Uses Playwright WebKit

### `vizzlyScreenshot(name, options?)`

Captures a screenshot and sends it to Vizzly for comparison. By default, captures just the `#ember-testing` container (your app), not the QUnit test runner UI.

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

// Basic usage - captures app at 1280x720
await vizzlyScreenshot('homepage');

// Mobile viewport
await vizzlyScreenshot('homepage-mobile', {
  width: 375,
  height: 667
});

// Capture specific element within the app
await vizzlyScreenshot('login-form', {
  selector: '[data-test-login-form]'
});

// Full options
await vizzlyScreenshot('screenshot-name', {
  // Viewport dimensions (default: 1280x720)
  width: 1280,
  height: 720,

  // Capture specific element within #ember-testing
  selector: '[data-test-component]',

  // What to capture: 'app' (default), 'container', or 'page'
  scope: 'app',

  // Capture full scrollable content
  fullPage: false,

  // Add custom metadata
  properties: {
    theme: 'dark',
    user: 'admin'
  },

  // Fail test if visual diff detected (overrides --fail-on-diff flag)
  failOnDiff: true
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | number | 1280 | Viewport width for the screenshot |
| `height` | number | 720 | Viewport height for the screenshot |
| `selector` | string | null | CSS selector to capture specific element |
| `scope` | string | 'app' | What to capture: `'app'` (just #ember-testing), `'container'`, or `'page'` (full page including QUnit) |
| `fullPage` | boolean | false | Capture full scrollable content |
| `properties` | object | {} | Custom metadata attached to the screenshot |
| `failOnDiff` | boolean | null | Fail the test when visual diff is detected. `null` uses the `--fail-on-diff` CLI flag. |

The function automatically:
- Waits for Ember's `settled()` before capturing
- Expands the `#ember-testing` container to the specified viewport size
- Captures just your app content (not the QUnit UI)

### `isVizzlyAvailable()`

Check if Vizzly is available in the current test environment.

```javascript
import { isVizzlyAvailable } from '@vizzly-testing/ember/test-support';

if (isVizzlyAvailable()) {
  await vizzlyScreenshot('conditional-screenshot');
}
```

## Browser Support

| Browser | Status |
|---------|--------|
| Chromium (Chrome, Edge) | Fully supported |
| Firefox | Supported |
| WebKit (Safari) | Supported |

Install browsers with:

```bash
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit
```

## How It Works

1. **Testem Configuration**: The `configure()` wrapper replaces standard browser launchers with custom Vizzly launchers
2. **Custom Launcher**: When Testem starts, it spawns `vizzly-testem-launcher` which uses Playwright
3. **Playwright Integration**: The launcher uses Playwright to control the browser and capture screenshots
4. **Screenshot Server**: A local HTTP server receives screenshot requests from test code
5. **Vizzly Integration**: Screenshots are forwarded to the Vizzly TDD server for comparison

## CI/CD

For CI environments, ensure:

1. Browsers are installed: `npx playwright install chromium`
2. Vizzly token is set: `VIZZLY_TOKEN=your-token`

```yaml
# GitHub Actions example
- name: Install Playwright
  run: npx playwright install chromium

- name: Run Tests
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
  run: ember test
```

### Failing on Visual Diffs

By default, visual differences don't fail tests (similar to Percy). To fail tests when diffs are detected:

```bash
# Via CLI flag
vizzly tdd start --fail-on-diff

# Or per-screenshot in your test
await vizzlyScreenshot('critical-ui', { failOnDiff: true });
```

The priority order is: per-screenshot option > `--fail-on-diff` CLI flag > default (no failure).

## Troubleshooting

### "No screenshot server available"

Tests must be run through Testem with the Vizzly-configured launchers. Ensure:
- `testem.js` uses `configure()` wrapper
- Running via `ember test` (not direct browser)

### "No Vizzly server found"

Start the TDD server before running tests:

```bash
vizzly tdd start
```

### Browser fails to launch

Install the required browser:

```bash
npx playwright install chromium
```

For CI environments, you may need additional dependencies:

```bash
npx playwright install-deps chromium
```

## License

MIT
