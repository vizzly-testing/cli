# Vizzly CLI

> Visual proof that your UI works

[![npm version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Visual bugs slip through code review. They hide in pixel-perfect mockups, sneak past unit tests, and show up right when you're about to ship. Vizzly catches them first.

Unlike tools that re-render components in isolation, Vizzly captures screenshots directly from your functional tests—the *real thing*. Whether you're validating AI-generated code or testing manual changes, you get visual proof before anything hits production.

## Why Vizzly?

**Local TDD workflow.** See changes as you type, not after CI. The `vizzly tdd` command runs a local dashboard that compares screenshots instantly—no cloud roundtrip, no waiting.

**Smart diffing with Honeydiff.** Our Rust-based comparison engine is 12x faster than alternatives and ignores the noise: timestamps, ads, font rendering differences. It finds real changes.

**Any screenshot source.** Playwright, Cypress, Puppeteer, Selenium, native mobile apps, or even design mockups. If you can capture it, Vizzly can compare it.

**Team-based pricing.** Pay for your team, not your screenshots. Test everything without budget anxiety.

## Quick Start

Requires Node.js 22+.

```bash
npm install -g @vizzly-testing/cli

vizzly init
```

### Local Development (TDD Mode)

Start the TDD server, run your tests in watch mode, and see visual diffs instantly at `http://localhost:47392`.

```bash
vizzly tdd start
npm test -- --watch
```

The dashboard shows diffs in real-time. Accept or reject changes right from the UI.

### Cloud Integration (CI/CD)

For team collaboration and CI pipelines:

```bash
vizzly login
vizzly run "npm test" --wait
```

The `--wait` flag polls for results and exits with code 1 if visual differences are detected.

For CI environments, set your project token:

```bash
export VIZZLY_TOKEN=your-project-token
vizzly run "npm test" --wait
```

## Capture Screenshots

Add screenshots to your existing tests:

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage looks correct', async ({ page }) => {
  await page.goto('/');

  let screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot, {
    browser: 'chrome',
    viewport: '1920x1080'
  });
});
```

The client SDK is lightweight—it just POSTs to the local server. Works with any test runner. SDKs available for [JavaScript](https://docs.vizzly.dev/integration/sdk/javascript), [Ruby](https://docs.vizzly.dev/integration/sdk/ruby), [Swift](https://docs.vizzly.dev/integration/sdk/swift), and [more](https://docs.vizzly.dev/integration/sdk/overview).

Already saving screenshots to disk? Pass the file path instead:

```javascript
await page.screenshot({ path: './screenshots/homepage.png' });
await vizzlyScreenshot('homepage', './screenshots/homepage.png');
```

Or upload an existing folder of screenshots:

```bash
vizzly upload ./screenshots
```

## Configuration

Generate a config file:

```bash
vizzly init
```

Or create `vizzly.config.js` manually:

```javascript
export default {
  comparison: {
    threshold: 2.0  // CIEDE2000 Delta E (0=exact, 2=recommended)
  }
};
```

## Commands

| Command | Description |
|---------|-------------|
| `vizzly tdd start` | Start local TDD server with dashboard |
| `vizzly tdd run "cmd"` | Run tests once, generate static report |
| `vizzly run "cmd"` | Run tests with cloud integration |
| `vizzly upload <dir>` | Upload existing screenshots |
| `vizzly login` | Authenticate via browser |
| `vizzly doctor` | Validate local setup |

## Documentation

Full documentation at **[docs.vizzly.dev](https://docs.vizzly.dev)**—including framework guides,
CI/CD setup, configuration reference, and more.

## Contributing

Found a bug? Have an idea? [Open an issue](https://github.com/vizzly-testing/cli/issues) or submit a PR.

## License

MIT
