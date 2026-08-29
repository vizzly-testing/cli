# SDK Capture

Use the repository's existing Vizzly integration and user journey. The
JavaScript example applies only when no framework-specific capture path already
owns the workflow.

## JavaScript

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

let screenshot = await page.screenshot();
await vizzlyScreenshot('settings-profile-edit-mode', screenshot);
```

`vizzlyScreenshot(name, image, options)` accepts PNG bytes or a file path.
Options include `properties`, `threshold`, `minClusterSize`, and
`fullPage`. Preserve existing tuning unless visual evidence justifies changing
it.

## Keep Identity Stable

Use a descriptive name. Identity always includes the name, viewport width, and
browser. Configured `signatureProperties` add custom identity fields; other
properties are metadata.

Do not assume theme, locale, or state creates a separate baseline unless the
configuration says so. Avoid generic names such as `screenshot1` and names
with slashes.

## Follow Existing Integrations

- Keep the Vizzly Vitest matcher when it is already configured:

  ```javascript
  await expect(page).toMatchScreenshot('hero-section.png');
  ```

- Prefer existing Storybook, static-site, Ember, or Swift capture flows over a
  parallel test path.
- Inspect the repository's integration setup before changing capture code.
