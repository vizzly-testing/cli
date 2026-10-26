# SDK capture

Use the repo's existing Vizzly integration and test flow. Use this JavaScript
example only if the repo doesn't already capture screenshots through a
framework integration.

## JavaScript

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

let screenshot = await page.screenshot();
await vizzlyScreenshot('settings-profile-edit-mode', screenshot);
```

`vizzlyScreenshot(name, image, options)` accepts PNG bytes or a file path.
Options include `properties`, `threshold`, `minClusterSize`, and `fullPage`.
Keep existing settings unless the images show why they need to change.

## Keep names and baseline matching consistent

Use descriptive names and keep them the same across runs. Baseline matching
always uses the name, viewport width, and browser. To also match on custom
properties, use `signatureProperties` in `vizzly.config.js` for local baselines.
Cloud baselines use the project's signature settings. Other properties are
metadata.

Theme, locale, or state won't create a separate baseline unless the matching
settings include them. Avoid generic names like `screenshot1` and names with
slashes.

## Follow the existing setup

Keep the Vitest matcher if it's already configured:

```javascript
await expect(page).toMatchScreenshot('hero-section.png');
```

Check the repo's setup before changing capture code. Use its Storybook,
static-site, Ember, or Swift integration if it has one.
