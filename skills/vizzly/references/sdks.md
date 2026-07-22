# SDK Capture Patterns

Prefer the repository's existing Vizzly integration and user journey. Add a new
capture path only when the task requires it.

## JavaScript Client

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

let screenshot = await page.screenshot();
await vizzlyScreenshot('settings-profile-edit-mode', screenshot);
```

`vizzlyScreenshot(name, image, options)` accepts PNG bytes or a file path.
Available options include:

- `properties`: metadata attached to the screenshot.
- `threshold`: per-screenshot CIEDE2000 Delta E tolerance.
- `minClusterSize`: minimum changed-pixel cluster size.
- `fullPage`: whether the screenshot represents a full-page capture.

Do not add arbitrary tuning values. Preserve the repository's existing values
unless visual evidence justifies changing them.

## Screenshot Identity

Use a stable, descriptive name. Vizzly's signature always includes the name,
viewport width, and browser. Only properties named in the project's
`signatureProperties` configuration participate in baseline identity.

Treat other `properties` as metadata. Do not assume values such as theme,
locale, or state create separate baselines unless the configuration says so.

## Existing Integrations

- Use the Vizzly Vitest matcher when the project already configures the plugin:

  ```javascript
  await expect(page).toMatchScreenshot('hero-section.png');
  ```

- Prefer existing Storybook, static-site, or Ember capture flows over adding a
  parallel Playwright path.
- For Swift/XCTest, inspect the repository's Vizzly Swift package documentation
  and existing `VizzlyXCTest` usage before changing capture code.

Use properties for searchable metadata and configured variants. Avoid generic
names such as `screenshot1` or `test`, and avoid names with slashes.
