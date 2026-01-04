# @vizzly-testing/ember

Visual testing SDK for Ember.js projects using Testem. Capture screenshots from your acceptance and integration tests and compare them with Vizzly.

## Installation

```bash
npm install -D @vizzly-testing/ember

# Install browser (Chromium is recommended)
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
  launch_in_dev: ['Chrome']
});
```

The `configure()` function replaces standard browser launchers (Chrome, Firefox, Safari) with Playwright-powered launchers that can capture screenshots.

> **Note for Ember + Vite projects**: The `cwd: 'dist'` option is required because Vite builds test files into the `dist/` directory. Without this, Testem won't find your test assets.

### 2. Write Tests with Snapshots

Import `vizzlySnapshot` in your test files:

```javascript
// tests/acceptance/dashboard-test.js
import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';

module('Acceptance | Dashboard', function(hooks) {
  setupApplicationTest(hooks);

  test('renders empty state', async function(assert) {
    await visit('/dashboard');

    // Capture screenshot
    await vizzlySnapshot('dashboard-empty');

    assert.dom('[data-test-empty-state]').exists();
  });

  test('renders with data', async function(assert) {
    // ... setup data
    await visit('/dashboard');

    // Capture specific element
    await vizzlySnapshot('dashboard-table', {
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

### `configure(testemConfig)`

Wraps your Testem configuration to use Vizzly-powered browser launchers.

```javascript
const { configure } = require('@vizzly-testing/ember');

module.exports = configure({
  // Your existing testem.js options
  launch_in_ci: ['Chrome'],
  launch_in_dev: ['Chrome'],
});
```

**Browser Mapping:**
- `Chrome` → Uses Playwright Chromium
- `Firefox` → Uses Playwright Firefox
- `Safari` / `WebKit` → Uses Playwright WebKit

### `vizzlySnapshot(name, options?)`

Captures a screenshot and sends it to Vizzly for comparison. By default, captures just the `#ember-testing` container (your app), not the QUnit test runner UI.

```javascript
import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';

// Basic usage - captures app at 1280x720
await vizzlySnapshot('homepage');

// Mobile viewport
await vizzlySnapshot('homepage-mobile', {
  width: 375,
  height: 667
});

// Capture specific element within the app
await vizzlySnapshot('login-form', {
  selector: '[data-test-login-form]'
});

// Full options
await vizzlySnapshot('screenshot-name', {
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
  }
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
| `properties` | object | {} | Custom metadata attached to the snapshot |

The function automatically:
- Waits for Ember's `settled()` before capturing
- Expands the `#ember-testing` container to the specified viewport size
- Captures just your app content (not the QUnit UI)

### `isVizzlyAvailable()`

Check if Vizzly is available in the current test environment.

```javascript
import { isVizzlyAvailable } from '@vizzly-testing/ember/test-support';

if (isVizzlyAvailable()) {
  await vizzlySnapshot('conditional-snapshot');
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
2. **Custom Launcher**: When Testem starts, it spawns `vizzly-browser` instead of the regular browser
3. **Playwright Integration**: The launcher uses Playwright to control the browser and capture screenshots
4. **Snapshot Server**: A local HTTP server receives screenshot requests from test code
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

## Troubleshooting

### "No snapshot server available"

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
