# Vizzly CLI

> Visual regression testing from your terminal

[![package version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <img src="./docs/assets/vizzly-mascot-inspector.png" alt="Vizzly bear inspecting a screenshot" width="220" />
</p>

Vizzly is a visual testing and regression platform for teams that ship UI. It
captures screenshots from your real tests, compares them to approved baselines,
and gives you useful review data: meaningful diffs, comments, approvals, build
status, and preview links.

This package is the CLI and local SDK surface. Use it to run local visual TDD,
upload screenshots from CI, generate static reports, and fetch machine-readable
build or diff data for scripts, automation, and coding agents.

## Quick Start

You need Node.js 22+.

```bash
pnpm install -g @vizzly-testing/cli

vizzly init
```

For agent-friendly repos, install the Vizzly skill and add a short project
`AGENTS.md` note:

```bash
vizzly init --agent-guidance
```

### Start Local TDD

Start the TDD server, run your tests, and open the dashboard at
`http://localhost:47392`.

```bash
vizzly tdd start
pnpm test -- --watch
```

The dashboard shows screenshots, baselines, and diffs as they arrive. Accept or
reject changes right from the UI.

### Run With Cloud Review

Use cloud builds when you want shared baselines, team review, and CI status:

```bash
vizzly login
vizzly run "pnpm test" --wait
```

`--wait` blocks until Vizzly finishes processing the build. It exits with code
`1` when visual differences need review.

In CI, use a project token:

```bash
export VIZZLY_TOKEN=your-project-token
vizzly run "pnpm test" --wait
```

### Inspect Builds And Diffs

Use `vizzly context` when you need build, comparison, screenshot, or review
queue data from the terminal.

This is useful for scripts, coding agents, and debugging loops. Instead of
making a pile of narrow API calls, ask for one focused bundle and get the
evidence in one place.

```bash
# Cloud context for a build or comparison
vizzly context build abc123
vizzly context comparison def456 --json

# Local workspace context from .vizzly/
vizzly context build current --source local
vizzly context build current --source local --agent
vizzly context screenshot build-detail-screenshots --source local --json
vizzly context review-queue --source local --json
```

`--json` is the durable automation path. `--agent` gives a compact handoff for
prompt assembly. Add `--full` when you need the whole payload, or
`--include screenshots,diffs,comments` when compact JSON needs selected detail.

Local context is read-only and file-backed. It reads your existing `.vizzly`
workspace state from TDD runs, including screenshots, diffs, and saved hotspot
or region metadata.

Cloud context is also read-only right now. That is intentional. Vizzly helps you
see and inspect visual changes, while people still decide what gets approved.

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

The client SDK is lightweight. It posts screenshots to the local Vizzly server
or the cloud build wrapper. It works with any test runner.

SDKs are available for
[JavaScript](https://docs.vizzly.dev/integration/sdk/javascript),
[Ruby](https://docs.vizzly.dev/integration/sdk/ruby),
[Swift](https://docs.vizzly.dev/integration/sdk/swift), and
[more](https://docs.vizzly.dev/integration/sdk/overview).

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

To teach project agents about Vizzly screenshot memory and the local visual TDD
loop, add the repo-local skill and AGENTS.md guidance:

```bash
vizzly init --agent-guidance
```

Or create `vizzly.config.js` manually:

```javascript
export default {
  comparison: {
    // CIEDE2000 Delta E. 0 is exact. 2 is a good default.
    threshold: 2.0,
  },
};
```

## Commands

| Command | What it does |
| --- | --- |
| `vizzly tdd start` | Start the local TDD server and dashboard. |
| `vizzly tdd run "cmd"` | Run tests once and generate a static visual report. |
| `vizzly run "cmd"` | Run tests with cloud build and review integration. |
| `vizzly context ...` | Fetch visual context for builds, comparisons, screenshots, and review queues. |
| `vizzly upload <dir>` | Upload an existing folder of screenshots. |
| `vizzly login` | Authenticate through the browser. |
| `vizzly doctor` | Validate your local setup. |

## Documentation

Full documentation lives at **[docs.vizzly.dev](https://docs.vizzly.dev)**.
Start there for framework guides, CI setup, SDK examples, and the configuration
reference.

## Contributing

Found a bug or have an idea?
[Open an issue](https://github.com/vizzly-testing/cli/issues) or send a PR.

## License

MIT
