# Public Screenshots

Public screenshots are Vizzly's path for stable image URLs in docs and manuals.

Use this when a user asks for hotlinked UI screenshots, generated manual images, docs that stay current with UI, or CDN-like screenshot URLs.

## Mental Model

Do not use arbitrary build screenshot URLs as stable docs assets. Use Public Properties.

The flow:

1. Capture screenshots with stable metadata.
2. Configure project Public Properties in Vizzly.
3. Approve/publish the baseline build.
4. Use the Public URLs tab to copy the stable URL.

Example capture:

```javascript
await vizzlyScreenshot('watering-widget', screenshot, {
  properties: {
    manual: 'plant-care',
    component: 'watering-widget',
    viewport: 'desktop'
  }
});
```

Configure a Public Property like `manual=plant-care`. Vizzly publishes matching approved baseline screenshots and keeps stable URLs for each screenshot/property identity.

## Good Uses

- Product manuals
- User docs
- Component catalogs
- In-app UI examples
- Screenshots that should update when approved UI changes

## Cautions

- Public screenshots are public. Do not publish private user data, secrets, or internal-only UI.
- A new unapproved build does not automatically become the public docs image.
- Use stable names and properties so URLs do not churn.
