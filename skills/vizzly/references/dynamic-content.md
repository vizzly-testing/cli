# Dynamic Content

Treat dates, timers, randomized data, API-backed content, generated images, and
responsive text as possible causes of change, not automatic explanations.

## Diagnose Before Tuning

1. Inspect screenshot history and the actual image evidence:

   ```bash
   vizzly context screenshot "<screenshot-name>" --json
   ```

2. Record the observed region, recurrence, render metadata, and whether the
   same change appears across builds or variants.
3. Check whether deterministic fixtures can remove irrelevant variation.
4. Treat hotspots and confirmed regions as server- or user-owned evidence.
   They can affect comparison results, but this CLI exposes them for inspection
   rather than authoring.
5. Preserve existing per-screenshot `threshold` and `minClusterSize` values
   unless the task and repeated evidence justify a change. Do not invent new
   tolerance values from one diff.

## Avoid

- Raising a global threshold for one unstable area.
- Masking a whole page when only a small region changes.
- Assuming a recurring change is harmless without inspecting it.
- Ignoring structural movement because a region contains dynamic content.
- Claiming a cause when only metadata, rather than images or history, is
  available.

## Report Findings

State the observed change first. Then distinguish a likely explanation—such as
fixture drift, content disappearance, layout shift, capture timing, or baseline
mismatch—from unresolved alternatives. Include the screenshot identity and the
context command or link used.
