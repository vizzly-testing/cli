# @vizzly-testing/static-site

Capture screenshots from a static site build and review changes with Vizzly.
Works with any generator that produces HTML, including Astro, Gatsby, Jekyll,
and Next.js static exports.

## Get started

You need Node.js 22.18+ on Node 22, or Node.js 24+.

```bash
pnpm install -D @vizzly-testing/cli @vizzly-testing/static-site \
  'playwright-core@^1.63.0'
pnpm exec playwright-core install chromium
pnpm run build
pnpm exec vizzly tdd start --open
pnpm exec vizzly static-site ./dist
```

Vizzly finds the plugin automatically. Point it at your build folder: `dist/`
for Astro, `public/` for Gatsby or Hugo, `_site/` for Jekyll or Eleventy, and
`out/` for Next.js static exports.

Vizzly looks for a running TDD server through `.vizzly/server.json` in this
folder or its parents. If it finds one, screenshots go there. Otherwise, set
`VIZZLY_TOKEN` to upload them for review:

```bash
VIZZLY_TOKEN=your-token pnpm exec vizzly static-site ./dist
```

Without a server or token, the plugin warns and skips screenshots. You don't
need to wrap it in `pnpm exec vizzly run`.

## Configuration

Add `staticSite` to `vizzly.config.js`:

```javascript
export default {
  comparison: { threshold: 0.1, minClusterSize: 2 },
  staticSite: {
    viewports: [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'desktop', width: 1920, height: 1080 },
    ],
    browser: {
      type: 'chromium',
      headless: true,
      args: ['--no-sandbox'],
    },
    screenshot: {
      fullPage: true,
      omitBackground: false,
      timeout: 45000,
      requestTimeout: 60000,
    },
    include: 'blog/**',
    exclude: '**/404',
    pageDiscovery: {
      useSitemap: true,
      sitemapPath: 'sitemap.xml',
      scanHtml: true,
    },
  },
};
```

Put comparison settings at the top level and capture settings under
`staticSite`. Vizzly runs captures in parallel using half your CPU cores, with
a minimum of 2 and maximum of 8. Set `concurrency` to choose another number.

Global settings merge as defaults → `staticSite` config → CLI options.
`vizzly.static-site.js` adds hooks and page overrides. Matching page overrides
apply last, including their viewports and screenshot settings.

## Find pages and run hooks

Vizzly combines URLs from `sitemap.xml` with HTML files found in the build
folder and removes duplicates. Sitemap URLs become relative paths. Set
`pageDiscovery.useSitemap: false` to use only HTML scanning.

To click, scroll, or wait for content before a screenshot, add hooks in
`vizzly.static-site.js`:

```javascript
export default {
  interactions: {
    'blog/*': async (page) => {
      await page.waitForSelector('.blog-content');
    },
    'scroll-to-footer': async (page) => {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    },
  },
  pages: {
    '/': { viewports: ['mobile', 'desktop'] },
    '/contact': {
      interaction: 'scroll-to-footer',
      screenshot: { fullPage: true, properties: { theme: 'dark' } },
    },
  },
};
```

Hooks can match page paths or have names you use in `pages`. Use `blog/*` for
one level of blog pages and `docs/**` for nested pages. `*` matches within a
path segment; `**` also matches across `/`.

## CLI options

```bash
pnpm exec vizzly static-site ./dist --viewports "mobile:375x667,desktop:1920x1080"
pnpm exec vizzly static-site ./dist --include "blog/**" --exclude "**/404"
```

| Option | What it does |
| --- | --- |
| `--viewports <list>` | Comma-separated `name:WxH` viewports. |
| `--concurrency <n>` | Number of parallel browser tabs. Default: half your CPU cores, 2–8. |
| `--browser <type>` | `chromium`, `firefox`, or `webkit`. |
| `--include <pattern>` / `--exclude <pattern>` | Filter page paths. |
| `--browser-args <args>` | Comma-separated Playwright browser arguments. |
| `--headless` / `--no-headless` | Hide or show the browser. Default: hidden. |
| `--full-page` / `--no-full-page` | Capture the full page or just the viewport. Default: full page. |
| `--timeout <ms>` | Screenshot timeout. Default: `45000`. |
| `--request-timeout <ms>` | Timeout for sending a screenshot to Vizzly. |
| `--dry-run` | List discovered pages and task count without capturing. |
| `--use-sitemap` / `--no-use-sitemap` | Enable or disable sitemap discovery. Default: enabled. |
| `--sitemap-path <path>` | Sitemap path relative to the build folder. |

## Screenshot names and properties

Names come from page paths: `/` becomes `index`, and `/blog/post-1` becomes
`blog-post-1`. Each screenshot includes `browser` and `url` properties. Add
custom properties under `pages['/path'].screenshot.properties` in
`vizzly.static-site.js`, as shown above. Vizzly reads dimensions from the image.

## CI

Build the site, then capture it with a token stored as a CI secret:

```yaml
- run: pnpm install
- run: pnpm exec playwright-core install --with-deps chromium
- run: pnpm run build
- run: pnpm exec vizzly static-site ./dist
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## From JavaScript

Start `pnpm exec vizzly tdd start --open` first, then use this script for local
capture. Pass settings in the options below; this call doesn't load
`vizzly.config.js`. Use the CLI for cloud uploads so it can supply build services.

```javascript
import { run } from '@vizzly-testing/static-site';

await run('./dist', {
  viewports: 'mobile:375x667,desktop:1920x1080',
  concurrency: 4,
}, {
  output: console,
});
```

## Troubleshooting

- **No pages found:** Make sure the build finished and contains HTML or a
  sitemap. Run `pnpm exec vizzly static-site ./dist --dry-run` to check discovery.
- **Browser won't launch:** Run `pnpm exec playwright-core install chromium`.
  On Linux CI, add `--with-deps` to install browser dependencies too. Vizzly
  already adds the sandbox and shared-memory flags for Chromium.
- **Blank screenshots:** Add a hook that waits for your content, such as
  `await page.waitForSelector('.app-loaded')`.
- **Sitemap paths don't match:** Set `useSitemap: false` and `scanHtml: true`
  under `pageDiscovery`.

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
