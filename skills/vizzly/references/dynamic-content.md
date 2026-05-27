# Dynamic Content

Dynamic content is common: dates, calendars, generated images, avatars, timers, randomized data, responsive text, and API-backed content.

## Order Of Operations

1. Make test data deterministic when the changing content is not what you are testing.
2. Inspect screenshot context before changing code:

```bash
vizzly context screenshot "<screenshot-name>" --json
```

3. Use per-screenshot tolerances for local noise:

```javascript
await vizzlyScreenshot('plant-calendar', screenshot, {
  properties: { surface: 'calendar' },
  threshold: 4,
  minClusterSize: 12
});
```

4. Use hotspots or confirmed regions for recurring valid dynamic regions.

## Avoid

- Raising global project thresholds for one dynamic area.
- Masking a whole page when a small region changes.
- Treating every daily diff as product breakage.
- Ignoring structural changes because a region is known to be dynamic.

## How To Explain Findings

Say whether the diff looks like:

- expected dynamic content
- deterministic fixture drift
- real content disappearance
- layout shift
- screenshot timing/capture instability
- baseline mismatch

Then name the screenshot and include the relevant context command or link.
