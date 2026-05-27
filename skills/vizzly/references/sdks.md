# SDK Capture Patterns

Vizzly works best when screenshots are attached to real user journeys and stable names.

## JavaScript Client

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

let screenshot = await page.screenshot();
await vizzlyScreenshot('settings-profile-edit-mode', screenshot, {
  properties: {
    browser: 'chromium',
    viewport: 'desktop',
    state: 'edit'
  },
  threshold: 2,
  minClusterSize: 4
});
```

`vizzlyScreenshot(name, image, options)` accepts a PNG buffer or file path.

Important options:

- `properties`: metadata used for baseline identity and filtering.
- `threshold`: per-screenshot CIEDE2000 Delta E tolerance.
- `minClusterSize`: minimum changed-pixel cluster size.
- `fullPage`: marks full-page captures.

## Vitest

Use the Vizzly Vitest plugin when present. It keeps the native `toMatchScreenshot` style:

```javascript
await expect(page.getByRole('heading')).toMatchScreenshot('hero-section.png', {
  properties: {
    theme: 'dark',
    viewport: 'desktop'
  },
  threshold: 2,
  fullPage: true
});
```

## Storybook And Static Sites

If the repo uses Vizzly Storybook or static-site clients, prefer those existing flows over adding custom Playwright screenshots. They already know how to crawl stories/pages, name screenshots, and attach viewport metadata.

## Swift

Swift/XCTest projects use `VizzlyXCTest` helpers such as `app.vizzlyScreenshot(name:properties:threshold:minClusterSize:)`. For iOS work, verify against the Swift package docs in the repo before changing examples.

## Naming

Use stable, descriptive screenshot names:

- Good: `checkout-payment-form-valid-card`
- Good: `settings-profile-edit-mode`
- Avoid: `screenshot1`, `test`, names with slashes

Use properties for variants instead of stuffing every variant into the name.
