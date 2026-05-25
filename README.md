# Vizzly CLI

> Visual review for agents and teams

[![package version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Vizzly keeps the visual truth behind your UI: approved baselines, meaningful diffs, review state, comments, and preview links in one place. That makes it useful for humans reviewing product changes and for LLM agents that need to understand what the UI is supposed to look like before they edit it.

Unlike tools that re-render components in isolation, Vizzly captures screenshots directly from your functional tests: the real thing. Whether you're validating AI-generated code or testing manual changes, you get reviewed visual evidence before anything hits production.

## Why Vizzly?

**Local TDD workflow.** See changes as you type, not after CI. The `vizzly tdd` command runs a local dashboard that compares screenshots instantly and exposes the current workspace as local context.

**Meaningful diff metadata.** Vizzly stores rich diff evidence: changed regions, cluster metadata, fingerprints, hotspots, confirmed regions, and image URLs. Agents can inspect what changed instead of guessing from a pass/fail label.

**Any screenshot source.** Playwright, Cypress, Puppeteer, Selenium, native mobile apps, or even design mockups. If you can capture it, Vizzly can compare it.

**Approved baselines as truth.** Cloud context carries human review state. Local context carries the downloaded or generated baseline metadata. That is the bridge between TDD locally and collaborative review in Vizzly.

## Quick Start

Requires Node.js 22+.

```bash
pnpm install -g @vizzly-testing/cli

vizzly init
```

### Local Development (TDD Mode)

Start the TDD server, run your tests in watch mode, and see visual diffs instantly at `http://localhost:47392`.

```bash
vizzly tdd start
pnpm test -- --watch
```

The dashboard shows diffs in real-time. Accept or reject changes right from the UI.

### Cloud Integration (CI/CD)

For team collaboration and CI pipelines:

```bash
vizzly login
vizzly run "pnpm test" --wait
```

The `--wait` flag polls for results and exits with code 1 if visual differences are detected.

For CI environments, set your project token:

```bash
export VIZZLY_TOKEN=your-project-token
vizzly run "pnpm test" --wait
```

### Visual Context For Agents

Use `vizzly context` when you want Vizzly to act like a visual context store, not just a test runner.

This is especially useful for LLM agents, automation, and quick debugging loops. Instead of
making a bunch of narrow API calls, you can ask for one build, comparison, screenshot, or review
queue bundle and get the evidence in one place.

```bash
# Cloud context for a build or comparison
vizzly context build abc123
vizzly context comparison def456 --json

# Local workspace context from .vizzly/
vizzly context build current --source local
vizzly context build current --source local --agent
vizzly context screenshot build-detail-screenshots --source local --json
```

`--json` is the durable automation path. `--agent` gives a compact handoff for prompt assembly and local dogfooding. Add `--full` when an agent really needs the complete build context payload, or `--include screenshots,diffs,comments` when the compact JSON needs selected detail.

Local context is read-only and file-backed. It reads your existing `.vizzly` workspace state from
TDD runs, including screenshots, diffs, and any saved hotspot or region metadata.

Cloud context is also read-only right now. That is intentional. It keeps the trust model simple:
Vizzly helps you see and inspect visual changes, while people still decide what gets approved.

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
| `vizzly context ...` | Fetch visual context bundles for builds, comparisons, and screenshots |
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
