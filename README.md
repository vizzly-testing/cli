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

You need Node.js 22.18+ on Node 22, or Node.js 24+. From your test project:

```bash
pnpm add --save-dev @vizzly-testing/cli
pnpm exec vizzly init
```

The wizard creates a config and offers agent guidance and cloud linking.
It previews file changes before applying them. If Vizzly is already configured,
init leaves it alone. Edit the config directly to change your setup.

To create a small config and edit it yourself, use `pnpm exec vizzly init --quick`.
It keeps existing config and doesn't install dependencies or run tests.

Choose a Vizzly client for your test setup, then add screenshot capture.
This example uses Playwright with the Node.js client:

```javascript
import { test } from '@playwright/test';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage looks correct', async ({ page }) => {
  await page.goto('/');
  await vizzlyScreenshot('homepage', await page.screenshot());
});
```

The client runs in Node.js and works with any Node-based test runner. You can
also pass a file path:

```javascript
await vizzlyScreenshot('homepage', './screenshots/homepage.png');
```

### Review locally

Start the local TDD server, then run your tests in another terminal:

```bash
pnpm exec vizzly tdd start --open
pnpm test -- --watch # Replace this with your test command
```

The dashboard shows screenshots and diffs as they arrive. Accept or reject
changes there. If the default port is busy, use the printed port with
`pnpm exec vizzly tdd status --port <port>` or
`pnpm exec vizzly tdd stop --port <port>`.

For a single run:

```bash
pnpm exec vizzly tdd run "pnpm test" --no-open
```

Review data goes in `.vizzly/`. When the run captures screenshots, it also
creates `.vizzly/report/index.html`. Omit `--no-open` to open the report.
If the configured port is busy, `tdd run` picks an available one. An explicit
`--port` uses only that port.

### Review in the cloud

```bash
pnpm exec vizzly login
pnpm exec vizzly project link your-org/your-project
pnpm exec vizzly run "pnpm test"
```

`vizzly login` signs you in. Linking saves the project name in your config and
keeps the upload token in user storage. Run it again to reuse a saved token.
Replace `"pnpm test"` with your test command.

If you linked with an older CLI, run `project link` once in each repository to
save its project selection. Handwritten config may need a manual edit; the
command prints what to add. Explicit `--token` and `VIZZLY_TOKEN` still work.

To upload screenshots you already have:

```bash
pnpm exec vizzly upload ./screenshots
```

### Run in CI

Store a project token as a CI secret and pass it as `VIZZLY_TOKEN`. Add `--wait`
when you want CI to wait for comparison results and fail on visual differences:

```bash
export VIZZLY_TOKEN=your-project-token
pnpm exec vizzly run "pnpm test" --wait
```

With `--wait`, failed comparisons make the command exit with code `1`.

## Screenshot options

```javascript
let screenshot = await page.screenshot({ fullPage: true });
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
dimensions from the screenshot. For local baseline matching, list custom keys
in `signatureProperties`. For cloud builds, set matching properties in your
Vizzly project settings. Common top-level options are
`threshold`, `minClusterSize`, `fullPage`, `requestTimeout`, and `buildId`.

For setup help, see the [Storybook](clients/storybook/README.md),
[static site](clients/static-site/README.md), [Vitest](clients/vitest/README.md),
and [Ember](clients/ember/README.md) guides. There are also
[Ruby](clients/ruby/README.md) and [Swift](clients/swift/README.md) SDKs.

## Configuration

`vizzly init --quick` creates a config with commented examples. Put settings
there when you want to change a default, or write `vizzly.config.js` yourself:

```javascript
export default {
  comparison: {
    threshold: 2, // CIEDE2000 Delta E color tolerance.
  },
};
```

Cloud comparisons use your project's settings unless you override them in
config, environment variables, or command options. Local comparisons use the
CLI defaults.

Existing config is kept, including TypeScript, rc files, and `package.json`.
Use `--config <path>` to choose a config or a new destination. `--force`
replaces the selected config; in `package.json`, it replaces only `vizzly`.

For TypeScript, use `vizzly.config.ts`. Node strips the types, so you don't need
a separate compiler. Use `import type` for types and include extensions in local
imports, like `./helpers.ts`. Enums, namespaces with runtime code, constructor
parameter properties, and `tsconfig.json` path aliases won't work in the config
or files it imports.

### Coding agents and scripts

Install the Vizzly skill and a short `AGENTS.md` note:

```bash
pnpm exec vizzly init --agent-guidance
```

This adds `.agents/skills/vizzly` and a note in `AGENTS.md`, keeping your
other instructions. Use `--agent-skill` for just the skill. Run either command
again to refresh it without changing your config.
`--skip-agent-skill` skips agent setup unless you also request `--agent-guidance`.

Use `context` to read local results. For cloud results, check the API schema
to find the available requests:

```bash
pnpm exec vizzly context build current --source local --json
pnpm exec vizzly context review-queue --source local --json
pnpm exec vizzly api schema --json
pnpm exec vizzly api schema sdk.getBuildContext --json
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
pnpm exec vizzly run "pnpm test" --parallel-id "$GITHUB_RUN_ID"
pnpm exec vizzly finalize "$GITHUB_RUN_ID"
```

Use `--batch-size` to set how many screenshots upload per request.
`--upload-timeout` limits how long `--wait` waits for build processing; it
doesn't set the HTTP upload timeout. You can also set
`--threshold` and `--min-cluster-size`. If CI has no cloud token,
`vizzly run --allow-no-token` lets your test command run without starting Vizzly.

## Commands

Use `pnpm exec vizzly --help` to see what's available in your project, or add
`--help` to a command for its options. These are the built-in commands; run them
with `pnpm exec` when Vizzly is installed locally.

<details>
<summary>Setup and accounts</summary>

| Command | What it does |
| --- | --- |
| `vizzly init` | Walk through setup. Use `--quick` to create config without questions. |
| `vizzly config [key]` | Show your current config. |
| `vizzly project link <org>/<project>` | Link this checkout to a cloud project. |
| `vizzly orgs` | List your organizations. |
| `vizzly projects` | List projects you can access. |
| `vizzly login` | Sign in through the browser. |
| `vizzly logout` | Clear your saved login. |
| `vizzly whoami` | Check your account and authentication status. |
| `vizzly doctor` | Check your setup. |

</details>

<details>
<summary>Local review</summary>

| Command | What it does |
| --- | --- |
| `vizzly tdd start` | Start the local server and dashboard. |
| `vizzly tdd status` | Check this project's local server. |
| `vizzly tdd list` | List running local servers. |
| `vizzly tdd stop` | Stop this project's local server. |
| `vizzly tdd run "command"` | Run tests once and save local review data. |
| `vizzly tdd screenshots list` | List captures from the latest local run. |
| `vizzly tdd screenshots latest [name]` | Print the latest capture's image path. |
| `vizzly tdd screenshots show <id-or-name>` | Show local capture details and the current image path. |
| `vizzly tdd screenshots accept <id-or-name>` | Save a local capture as its baseline. |
| `vizzly baselines` | List local baselines, or inspect one with `--info <name>`. |

</details>

<details>
<summary>Cloud builds</summary>

| Command | What it does |
| --- | --- |
| `vizzly run "command"` | Run tests and upload for cloud review. |
| `vizzly upload <dir>` | Upload screenshots. |
| `vizzly finalize <parallel-id>` | Finish a cloud build after all shards complete. |
| `vizzly preview <path>` | Upload a static preview for a cloud build; private projects need `--public-link`. |
| `vizzly status <build-id>` | Check cloud build status. |
| `vizzly builds` | List builds, or fetch one with `--build <id>`. |
| `vizzly comparisons --build <build-id>` | List a build's comparisons; also supports `--id` or `--name` queries. |

</details>

<details>
<summary>Build and screenshot context</summary>

| Command | What it does |
| --- | --- |
| `vizzly context build <build-id>` | Read build context. |
| `vizzly context comparison <comparison-id>` | Read comparison context. |
| `vizzly context screenshot <name>` | Read screenshot history. |
| `vizzly context similar <fingerprint-hash>` | Find cloud comparisons with similar diffs. |
| `vizzly context review-queue` | Read comparisons waiting for review. |

</details>

<details>
<summary>Review decisions</summary>

| Command | What it does |
| --- | --- |
| `vizzly approve <comparison-id>` | Approve a comparison. |
| `vizzly reject <comparison-id> --reason "message"` | Reject a comparison with a reason. |
| `vizzly comment <build-id> "message"` | Comment on a build. |

</details>

<details>
<summary>API</summary>

| Command | What it does |
| --- | --- |
| `vizzly api schema [operation-id]` | Discover cloud API requests, fields, and response formats. |
| `vizzly api <endpoint>` | Make API requests; use `--output <file>` for images. |

</details>

Installed plugins add commands such as `storybook`, `static-site`, and `previews`.
See their setup guides above for details.

## Contributing

Start in `src/domains/<domain>/` for CLI behavior or
`src/reporter/src/domains/<domain>/` for reporter UI. The
[architecture guide](docs/architecture.md) explains ownership, file roles, and
the shared runtime boundaries. Run `pnpm run check:architecture` when changing
source organization or imports.

## More

[Full docs](https://docs.vizzly.dev) ·
[Updating Vizzly](docs/updates.md) ·
[Report a bug or suggest a change](https://github.com/vizzly-testing/cli/issues)

PRs welcome. MIT licensed.
