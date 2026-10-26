# Vizzly CLI

> Reviewed UI context for coding agents and teams

[![package version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <img src="./docs/assets/vizzly-mascot-inspector.png" alt="Vizzly bear inspecting a screenshot" width="220" />
</p>

Vizzly helps your team and coding agents see what the UI should look like,
what changed, and what was approved. It keeps screenshots, diffs, and review
decisions together so you can use that history the next time you change the UI.

## Get started

You need Node.js 22.18+ on Node 22, or Node.js 24+.

```bash
pnpm install -g @vizzly-testing/cli
vizzly init
```

Then add a screenshot to a test. This example uses Playwright:

```javascript
import { test } from '@playwright/test';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage looks correct', async ({ page }) => {
  await page.goto('/');
  await vizzlyScreenshot('homepage', await page.screenshot());
});
```

The client works with any test runner. You can also pass a file path:

```javascript
await vizzlyScreenshot('homepage', './screenshots/homepage.png');
```

### Review locally

Start the local TDD server, then run your tests in another terminal:

```bash
vizzly tdd start --open
pnpm test -- --watch
```

The dashboard shows screenshots and diffs as they arrive. Accept or reject
changes there. If the default port is busy, use the printed port with
`vizzly tdd status --port <port>` or `vizzly tdd stop --port <port>`.

For a single run:

```bash
vizzly tdd run "pnpm test" --no-open
```

Review data goes in `.vizzly/`. When the run captures screenshots, it also
creates `.vizzly/report/index.html`. Omit `--no-open` to open the report.

### Review in the cloud

```bash
vizzly login
vizzly project link your-org/your-project
vizzly run "pnpm test" --wait
```

`vizzly login` signs you in. Linking gives this checkout a project upload token.
With `--wait`, the command waits for results and exits with code `1` when visual
changes need review.

In CI, set a project token:

```bash
export VIZZLY_TOKEN=your-project-token
vizzly run "pnpm test" --wait
```

To upload screenshots you already have:

```bash
vizzly upload ./screenshots --wait
```

## Screenshot options

```javascript
await vizzlyScreenshot('checkout', screenshot, {
  threshold: 2,
  minClusterSize: 4,
  fullPage: true,
  requestTimeout: 5000,
  properties: { theme: 'dark', locale: 'en-US' },
});
```

Put details like theme or locale in `properties` for baseline grouping and
filtering. Vizzly keeps these separate from screenshot options and reads image
dimensions from the screenshot. To use a custom property for baseline matching,
add it to `signatureProperties` in your config. The top-level options are
`threshold`, `minClusterSize`, `fullPage`, `requestTimeout`, and `buildId`.

For setup help, see the [Storybook](clients/storybook/README.md),
[static site](clients/static-site/README.md), [Vitest](clients/vitest/README.md),
and [Ember](clients/ember/README.md) guides. There are also
[Ruby](clients/ruby/README.md) and [Swift](clients/swift/README.md) SDKs.

## Configuration

`vizzly init` creates a config, or you can write `vizzly.config.js` yourself:

```javascript
export default {
  comparison: {
    threshold: 2, // CIEDE2000 Delta E; 0 requires an exact match.
  },
};
```

For TypeScript, use `vizzly.config.ts`. Node strips the types, so you don't need
a separate compiler. Use `import type` for types and include extensions in local
imports, like `./helpers.ts`. Enums, namespaces with runtime code, constructor
parameter properties, and `tsconfig.json` path aliases won't work in the config
or files it imports.

### Coding agents and scripts

Install the Vizzly skill and a short `AGENTS.md` note:

```bash
vizzly init --agent-guidance
```

Run it again after upgrading to update `.agents/skills/vizzly` and the Vizzly
note in `AGENTS.md`. It keeps your config and other guidance. Use `--agent-skill`
for just the skill, or `--skip-agent-skill` for config only.

Use `context` to read local results. For cloud results, check the API schema
to find the available requests:

```bash
vizzly context build current --source local --json
vizzly context review-queue --source local --json
vizzly api schema --json
vizzly api schema sdk.getBuildContext --json
```

The schema lists inputs, output fields, and how to fetch more results. The old
`context build --agent` and `context comparison --agent` formats are deprecated.
Use the API schema for new cloud workflows and `context --json` for local data.
See the [JSON reference](docs/json-output.md) for output formats and scripts.

### Parallel CI and uploads

Vizzly reuses images it already has by SHA. Add `--upload-all` to send every
image. For parallel jobs, use the same ID for every shard and finalize it when
they all finish:

```bash
vizzly run "pnpm test" --parallel-id "$GITHUB_RUN_ID"
vizzly finalize "$GITHUB_RUN_ID"
```

Use `--batch-size` to set how many screenshots upload per request and
`--upload-timeout` to limit upload and processing wait time. You can also set
`--threshold` and `--min-cluster-size`. For CI jobs without a cloud token, add
`--allow-no-token` to `vizzly run` to keep local capture working.

## Commands

| Command | What it does |
| --- | --- |
| `vizzly tdd start` | Start the local server and dashboard. |
| `vizzly tdd status` / `list` / `stop` | Check, list, or stop local servers. |
| `vizzly tdd run "cmd"` | Run tests once and save local review data. |
| `vizzly run "cmd"` | Run tests and upload for cloud review. |
| `vizzly context ...` | Read build, screenshot, and diff context. |
| `vizzly upload <dir>` | Upload screenshots. |
| `vizzly preview <dir>` | Upload a static site for in-context review. |
| `vizzly approve <comparison-id>` | Approve a comparison. |
| `vizzly reject <comparison-id>` | Reject a comparison with a reason. |
| `vizzly comment <build-id>` | Comment on a build. |
| `vizzly config [key]` | Show your current config. |
| `vizzly login` | Sign in through the browser. |
| `vizzly doctor` | Check your setup. |

## More

[Full docs](https://docs.vizzly.dev) ·
[Report a bug or suggest a change](https://github.com/vizzly-testing/cli/issues)

PRs welcome. MIT licensed.
