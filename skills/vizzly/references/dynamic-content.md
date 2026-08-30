# Dynamic Content

Dates, timers, random data, API content, generated images, and responsive text
can cause a diff. They are possible explanations, not conclusions.

## Diagnose Before Tuning

1. Inspect the actual images and screenshot history:

   ```bash
   vizzly context screenshot "<screenshot-name>" --source <local-or-cloud> --json
   ```

2. Record the visible region, recurrence, render metadata, and whether the same
   change appears across builds or variants.
3. Prefer deterministic fixtures when they can remove irrelevant variation.
4. Treat hotspots and confirmed regions as server- or user-authored evidence.
   This CLI exposes them for inspection, not authoring.
5. Preserve `threshold` and `minClusterSize` unless repeated evidence
   justifies a change.

Avoid broad masks, global threshold changes for one region, and claims based on
metadata alone. A recurring change can still be a bug, especially when content
movement affects nearby layout.

Report the observed change first. Label fixture drift, layout shift, capture
timing, or baseline mismatch as a possible cause until the evidence establishes
it.
