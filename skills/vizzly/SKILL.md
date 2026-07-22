---
name: vizzly
description: "Inspect, explain, and debug Vizzly visual regression evidence; use an existing Vizzly workflow before and after UI changes; add or adjust screenshot capture; troubleshoot local TDD or cloud builds; or configure Vizzly CI. Use when a task mentions Vizzly, screenshot baselines, comparisons, Honeydiff, visual review, dynamic regions, or a repository's Vizzly setup."
---

# Vizzly

Use Vizzly as visual evidence for user-facing changes. Keep the repository's
existing test workflow in charge of how the UI is exercised.

## Start From The Repository

1. Confirm that the repository uses Vizzly by checking its configuration,
   dependencies, scripts, or existing `.vizzly` data.
2. Use the repository's established CLI invocation. The examples in this skill
   use `vizzly`; substitute its package script, `pnpm exec vizzly`, or
   `npx vizzly` when that is how the repository runs local binaries.
3. Do not install, initialize, log in, or change credentials unless the task
   explicitly includes setup. Never print or persist a token.

## Follow The Evidence Loop

1. Choose the most relevant source:
   - Use a supplied cloud build or comparison ID when the task names one.
   - Use existing local context when `.vizzly` contains the run under review.
   - Generate fresh evidence through the repository's existing visual test
     workflow when stored evidence may be stale or absent.
2. Request the bounded, machine-readable build context:

   ```bash
   vizzly context build current --source local --agent --json
   vizzly context build <build-id> --agent --json
   ```

3. Check the build identity, source, branch, timestamps, baseline selection,
   review state, and truncation fields before interpreting the evidence. Treat
   omitted fields as unknown.
4. Inspect the current, baseline, and diff images together using whatever
   image, browser, URL, or local-file capability is available. If an image is
   inaccessible, say so and do not infer its visual contents from metadata.
5. Read viewport, browser, screenshot metadata, review state, and Honeydiff
   facts alongside the images. Follow the returned `suggested_commands` for
   exact comparison or screenshot drill-downs. Request raw diff regions only
   when the compact summary is insufficient.
6. Separate observations from explanations. State what the evidence shows,
   then label any proposed cause with appropriate confidence.
7. Make the smallest justified UI or test change, rerun the owning user
   workflow, and inspect the resulting evidence again.

## Guardrails

- Treat an approved baseline as the accepted reference for that comparison,
  not infallible truth. Check its identity and selection reason.
- Do not invent progress, counts, review state, visual causes, or missing API
  values.
- Do not approve, reject, comment on, publish, or replace visual evidence
  unless the user explicitly asks for that mutation.
- Preserve existing thresholds, cluster sizes, signature properties, and
  dynamic-region behavior unless the task and evidence justify changing them.
- Prefer deterministic fixtures and existing end-to-end journeys over hiding a
  diff with broader tolerances or a new screenshot-only test.
- Report the screenshot or comparison identity, the relevant build or link,
  the observed evidence, any access limitations, and the command used.

## Load References Only When Needed

- Read [references/cli-context.md](references/cli-context.md) for local and
  cloud inspection commands, TDD lifecycle, and evidence drill-downs.
- Read [references/sdks.md](references/sdks.md) only when adding or changing
  screenshot capture code.
- Read [references/dynamic-content.md](references/dynamic-content.md) when a
  diff may involve unstable content, hotspots, or confirmed regions.
- Read [references/setup-ci.md](references/setup-ci.md) only when the task asks
  to initialize Vizzly, change CI, or troubleshoot configuration.
