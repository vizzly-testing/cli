# @vizzly-testing/ember

Capture screenshots from Ember acceptance and integration tests with Testem.
Review them locally or upload them to Vizzly.

## Install

```bash
pnpm install -D @vizzly-testing/cli @vizzly-testing/ember
pnpm exec playwright install chromium
```

Firefox and WebKit work too. Install them with `playwright install firefox`
or `playwright install webkit`.

## Set up Testem

Wrap your existing Testem config with `configure()`:

```javascript
// testem.js (or testem.cjs for ES modules projects)
let { configure } = require('@vizzly-testing/ember');

module.exports = configure({
  cwd: 'dist',
  test_page: 'tests/index.html?hidepassed',
  disable_watching: true,
  launch_in_ci: ['Chrome'],
  launch_in_dev: ['Chrome'],
});
```

For Ember + Vite/Embroider, `cwd: 'dist'` is required so Testem can find the
built test files. `configure()` maps `Chrome` to Chromium, `Firefox` to Firefox,
and `Safari` or `WebKit` to WebKit. Browsers run headless by default.

Pass a second argument to change how Playwright launches the browser:

```javascript
configure(testemConfig, {
  headless: false,
  slowMo: 100,
  timeout: 60000,
});
```

You can also pass `proxy` and `args`. See the
[Playwright launch options](https://playwright.dev/docs/api/class-browsertype#browser-type-launch).

## Capture screenshots

```javascript
import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Acceptance | Dashboard', function(hooks) {
  setupApplicationTest(hooks);

  test('renders empty state', async function(assert) {
    await visit('/dashboard');
    assert.dom('[data-test-empty-state]').exists();
    await vizzlyScreenshot('dashboard-empty');
  });
});
```

The helper waits for Ember's `settled()`, resizes the app, and takes a screenshot
of `#ember-testing`, leaving the QUnit runner out of the image.

Start Vizzly, then run your tests:

```bash
vizzly tdd start --open
ember test
```

For Vite projects that run Testem directly, build with test files first:

```bash
pnpm run build --mode development
pnpm exec testem ci --file testem.cjs
```

Review screenshots at the dashboard URL Vizzly prints.

## Screenshot options

```javascript
await vizzlyScreenshot('login-form', {
  width: 375,
  height: 667,
  selector: '[data-test-login-form]',
  properties: { theme: 'dark' },
  failOnDiff: true,
});
```

| Option | Default | What it does |
| --- | --- | --- |
| `width` / `height` | `1280` / `720` | Viewport size. |
| `selector` | `null` | Capture an element within the app. |
| `scope` | `'app'` | `'app'`, `'container'`, or `'page'` (includes QUnit). |
| `fullPage` | `false` | Capture scrollable content for page scope. Other targets stay element-sized. |
| `properties` | `{}` | Custom metadata, such as theme or user role. |
| `threshold` | `null` | Comparison threshold; `null` uses the server config. |
| `minClusterSize` | `null` | Ignore connected diff clusters smaller than this pixel count; `null` uses the server config. |
| `failOnDiff` | `null` | Fail on a visual diff; `null` uses the launcher/server setting. |
| `buildId` | Injected | Use a different build ID from the one supplied by `vizzly run`. |
| `requestTimeout` | `null` | Screenshot HTTP request timeout in milliseconds. |

Screenshots include `browser`, `url`, and your custom properties. Dimensions
come from the image.

Local diffs don't fail tests by default. To change that, set `failOnDiff` on a
screenshot or start TDD with `vizzly tdd start --fail-on-diff`. Vizzly checks the
screenshot option first, then the launcher setting from `VIZZLY_FAIL_ON_DIFF`
or `.vizzly/server.json`. If neither is set, it uses `false`.

To check whether screenshot capture is available:

```javascript
import { isVizzlyAvailable } from '@vizzly-testing/ember/test-support';

if (isVizzlyAvailable()) {
  await vizzlyScreenshot('homepage');
}
```

## CI

Install the browser and save `VIZZLY_TOKEN` as a CI secret. Run tests through
`vizzly run` so Vizzly can finish the cloud upload:

```yaml
- run: pnpm exec playwright install chromium
- run: pnpm exec vizzly run "ember test"
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Troubleshooting

- **No screenshot server:** Make sure Testem uses `configure()` and runs through
  `ember test` or Testem, rather than opening the test page directly.
- **No Vizzly server:** Start `vizzly tdd start` before running local tests.
- **Browser won't launch:** Run `pnpm exec playwright install chromium`. In CI,
  you may also need `pnpm exec playwright install-deps chromium`.

## License

MIT
