# @vizzly-testing/vitest

[![package version](https://img.shields.io/npm/v/@vizzly-testing/vitest.svg)](https://www.npmjs.com/package/@vizzly-testing/vitest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Keep using `toMatchScreenshot` in your Vitest tests. This plugin sends the
screenshots to Vizzly for local comparisons or team review.

## Get started

You need Node.js 22.18+ on Node 22, or Node.js 24+.

```bash
pnpm install -D @vizzly-testing/vitest @vizzly-testing/cli vitest @vitest/browser @vitest/browser-playwright playwright
pnpm exec playwright install chromium
```

Add the plugin to `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';
import { vizzlyPlugin } from '@vizzly-testing/vitest';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [vizzlyPlugin()],
  test: {
    browser: {
      enabled: true,
      instances: [{ browser: 'chromium', provider: playwright() }],
    },
  },
});
```

Write a browser test:

```javascript
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

test('homepage looks correct', async () => {
  document.body.innerHTML = '<h1>Hello World</h1>';
  await expect(page.getByRole('heading')).toMatchScreenshot('homepage.png');
});
```

Start Vizzly, then run Vitest in another terminal:

```bash
pnpm exec vizzly tdd start --open
pnpm exec vitest
```

The first local screenshot becomes the baseline and passes. Later runs compare
against it. Open the dashboard URL Vizzly prints to review changes.

For cloud review, set `VIZZLY_TOKEN` and run:

```bash
pnpm exec vizzly run "pnpm exec vitest run"
```

To fail CI on visual differences, see the [CI example](../../README.md#run-in-ci).

## Screenshot options

`vizzlyPlugin()` takes no options. Pass settings to `toMatchScreenshot`:

```javascript
await expect(page).toMatchScreenshot('checkout.png', {
  properties: { theme: 'dark', locale: 'en-US' },
  threshold: 5,
  minClusterSize: 10,
  fullPage: true,
  failOnDiff: true,
});
```

| Option | What it does |
| --- | --- |
| `properties` | Custom details, like theme, locale, or state. |
| `threshold` | Diff sensitivity. Defaults to the server setting. |
| `minClusterSize` | Ignore connected diff clusters smaller than this pixel count. |
| `fullPage` | Capture the scrollable page. Element screenshots keep the element's size. |
| `failOnDiff` | Fail this assertion on a local visual diff. Defaults to the server or environment setting. |

Browser capture options such as `animations`, `caret`, `mask`, `maskColor`,
`omitBackground`, `scale`, and `timeout` pass through to Playwright. Vizzly adds
`browser` and `url` properties unless you supply them. Image dimensions come
from the screenshot, and TypeScript types are included.

To keep separate local baselines by theme, add `theme` to the top-level
`signatureProperties` setting in `vizzly.config.js`. For cloud baselines, add
`theme` to the project's baseline matching settings. Then pass it with each
screenshot:

```javascript
test('button themes', async () => {
  document.body.innerHTML = '<button>Save</button>';

  document.body.className = 'theme-light';
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    properties: { theme: 'light' },
  });

  document.body.className = 'theme-dark';
  await expect(page.getByRole('button')).toMatchScreenshot('button.png', {
    properties: { theme: 'dark' },
  });
});
```

For Node-based test runners, see the [CLI client example](../../README.md#get-started).
In Vitest browser tests, keep using `toMatchScreenshot`.

## Examples and tests

See [tests/e2e](tests/e2e/README.md) for a working Vitest browser project.
From `clients/vitest`:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run test:unit
pnpm run test:e2e
```

Start a TDD server before running the E2E tests.

## Troubleshooting

- **Vizzly isn't available:** Start `vizzly tdd start`, or wrap the test
  command in `vizzly run` for cloud capture.
- **No screenshots in the dashboard:** Check `vizzly tdd status` for local
  runs, or `VIZZLY_TOKEN` for cloud runs. Check the console for upload errors.

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
