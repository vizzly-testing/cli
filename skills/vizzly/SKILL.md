---
name: vizzly
description: Inspect and explain Vizzly visual regression evidence, verify UI changes, troubleshoot local or cloud builds, adjust screenshot capture, or configure Vizzly CI. Use when a task mentions Vizzly, screenshot baselines, comparisons, Honeydiff, visual review, or an existing Vizzly workflow.
---

# Vizzly

Use Vizzly as evidence for user-facing changes. Keep the repository's existing
test workflow in charge of how the UI is exercised.

## Prepare

1. Confirm the repository uses Vizzly by checking its config, dependencies,
   scripts, or `.vizzly` data.
2. Use the repository's established CLI invocation exactly. Otherwise, replace
   `vizzly` in these examples with `pnpm exec vizzly`; use `npx vizzly` when the
   repository uses npm.
3. Do not install, initialize, log in, or change credentials unless setup is in
   scope. Never print or persist a token.

## Inspect And Verify

1. Choose the supplied cloud build or comparison when one is named. Otherwise,
   use current local evidence or find the relevant cloud build.
2. Request bounded JSON:

   ```bash
   vizzly context build current --source local --agent --json
   vizzly context build <build-id> --source cloud --agent --json
   ```

3. Confirm the build, source, branch, timestamps, baseline, review state, and
   pagination before drawing conclusions. If `has_more` is true, run the
   returned next-page command before concluding. Missing fields remain unknown.
4. Follow `suggested_commands` to inspect a comparison. View its baseline,
   current, and diff images together. If an image cannot be opened, label the
   result metadata-only; do not call it visual verification.
5. Read image dimensions, viewport, browser, diff regions, fingerprint, and
   relevant history alongside the images. A prior approval is supporting
   evidence, not permission to approve the current comparison.
6. State observations before possible causes. Make the smallest justified
   change, rerun the owning workflow, and inspect the new evidence.

## Guardrails

- Do not invent progress, ranking, review state, visual causes, or missing API
  values.
- Do not approve, reject, comment on, publish, or replace evidence unless the
  task explicitly asks for that mutation.
- Preserve thresholds, cluster sizes, signature properties, and other capture
  settings unless repeated evidence justifies a change.
- Prefer deterministic fixtures and existing user journeys over hiding a diff
  with broader tolerances or a new screenshot-only test.
- Report the comparison or screenshot identity, observed evidence, access
  limitations, and the command or link used.

## Load A Reference When Needed

- [CLI context](references/cli-context.md): local and cloud evidence, build
  discovery, drill-downs, images, and TDD lifecycle.
- [SDK capture](references/sdks.md): add or change screenshot capture code.
- [Dynamic content](references/dynamic-content.md): investigate unstable
  content and screenshot-specific tolerances.
- [Setup and CI](references/setup-ci.md): initialize Vizzly or change CI.
