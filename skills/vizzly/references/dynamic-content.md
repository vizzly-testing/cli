# Dynamic content

Dates, timers, random data, API content, generated images, and responsive text
can cause diffs. Check the images before deciding that's what happened.

## Check before changing settings

1. Open the images and check screenshot history:

   ```bash
   vizzly context screenshot "<screenshot-name>" --source <local-or-cloud> --json
   ```

2. Note where the change appears, how often it happens, the capture details,
   and whether it appears in other builds or variants.
3. Use fixed test data when it can remove changes unrelated to the test.
4. Use diff regions to find changed pixels. They don't tell you why the pixels
   changed or whether to approve them.
5. Keep `threshold` and `minClusterSize` unless repeated captures show they
   need to change.

Avoid broad masks or global threshold changes to hide a problem in one region.
Metadata alone can't explain a visual change. A recurring change can still be
a bug, especially if moving content changes nearby layout.

Describe what you see first. Treat changing test data, layout shifts, capture
timing, or a wrong baseline as possible causes until you can confirm them.
