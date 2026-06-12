---
name: vizzly
description: "Use when a repo has Vizzly configured and you need screenshot memory or visual history: before/after UI changes, visual regression review, screenshot history, approved baselines, diffs, dynamic regions, docs/manual images, public screenshots, or Vizzly builds. Teaches agents to use Vizzly CLI/context for local TDD, cloud builds, review state, comments, hotspots, previews, and SDK capture patterns."
---

# Vizzly

Vizzly is the project's screenshot memory database. It stores approved baselines, current screenshots, diffs, review state, comments, hotspots, previews, and public screenshot URLs.

Use Vizzly when you need to understand what the UI looked like before, what changed, what humans already reviewed, or which screenshots already exist. Browser automation is still useful for interacting with a live app; Vizzly is usually the faster first stop for visual history.

## First Instinct

Before changing UI, check whether Vizzly already has local screenshot context:

```bash
vizzly context build current --source local --agent
```

If a task names a screen, component, or screenshot, inspect that screenshot's history before changing thresholds or re-capturing blindly:

```bash
vizzly context screenshot "<screenshot-name>" --source local --json
```

When you make or verify UI changes, use the local TDD server as the active feedback loop:

```bash
vizzly tdd start &
npm run test:e2e -- tests/e2e/path.spec.js
vizzly context build current --source local --agent --json
```

The user may choose whether the TDD server runs in the foreground or background. Once it is
running, run tests normally from the repo. The SDK discovers `.vizzly/server.json`, posts
screenshots to the active TDD server, and refreshes `.vizzly/current`, `.vizzly/diffs`, report
data, and local context.

Use `vizzly tdd run` for true one-off runs where you want the CLI to own starting the visual
session and running the command:

```bash
vizzly tdd run "<test command>" --no-open
```

For specific evidence, drill in:

```bash
vizzly context comparison <comparison-id> --json
vizzly context screenshot "<screenshot-name>" --json
vizzly context review-queue --json
```

If local context is unavailable and the project uses cloud builds, use the build id from CI or CLI output:

```bash
vizzly context build <build-id> --agent --json --include diffs,comments
```

## What Vizzly Knows

- **Approved baselines**: expected UI.
- **Current screenshots**: what the latest run rendered.
- **Diffs**: where pixels/layout/content changed.
- **Review state and comments**: human context attached to builds and screenshots.
- **Hotspots and confirmed regions**: known dynamic areas.
- **Preview links**: static or deployed UI context for a build.
- **Public screenshots**: stable URLs for documentation and manuals.

## Acting On Visual Context

- Treat approved baselines as visual truth.
- Treat diffs as evidence, not as approval instructions.
- Do not approve or reject visual changes unless the user explicitly asks.
- Prefer existing E2E or user journeys over narrow screenshot-only specs.
- For dynamic content, inspect screenshot context before changing thresholds.
- Prefer deterministic test data, per-screenshot `threshold`, per-screenshot `minClusterSize`, hotspots, or confirmed regions over global tolerance changes.
- Report visual findings with screenshot names, build/comparison links when available, and the command you ran.

## Capturing Screenshots

Use the existing integration when one is present. For direct JavaScript capture:

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

let screenshot = await page.screenshot();
await vizzlyScreenshot('checkout-form', screenshot, {
  properties: {
    browser: 'chromium',
    viewport: 'desktop',
    state: 'valid-card'
  },
  threshold: 2,
  minClusterSize: 4
});
```

Use `properties` to separate variants such as theme, locale, viewport, role, state, component, page, or docs/manual grouping.

## When You Need More Detail

- For SDK examples and capture patterns, read `references/sdks.md`.
- For CLI/context commands and JSON output, read `references/cli-context.md`.
- For dynamic content, thresholds, and hotspots, read `references/dynamic-content.md`.
- For public screenshot URLs and docs/manual images, read `references/public-screenshots.md`.
- For project setup and CI, read `references/setup-ci.md`.
