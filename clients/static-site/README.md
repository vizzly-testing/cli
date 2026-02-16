# @vizzly-testing/static-site

Seamlessly integrate your static sites (Gatsby, Astro, Jekyll, Next.js static export, etc.) into Vizzly's visual development workflow. Iterate locally with `vizzly tdd`, automatically create team builds from CI/CD, and collaborate on visual changes with position-based comments and review rules.

## Installation

```bash
npm install @vizzly-testing/static-site
```

The plugin is automatically discovered by the Vizzly CLI via the `@vizzly-testing/*` scope.

## Quick Start

### CLI Usage

```bash
# Capture screenshots from a static site build
vizzly static-site ./dist

# With custom viewports
vizzly static-site ./dist \
  --viewports "mobile:375x667,tablet:768x1024,desktop:1920x1080"

# With filtering
vizzly static-site ./dist \
  --include "blog/**" \
  --exclude "**/404.html"

# With concurrency control
vizzly static-site ./dist --concurrency 5
```

### Programmatic Usage

```javascript
import { run } from '@vizzly-testing/static-site';

await run('./dist', {
  viewports: 'mobile:375x667,desktop:1920x1080',
  concurrency: 3,
}, {
  logger: console,
  config: vizzlyConfig,
  services: serviceContainer,
});
```

## Configuration

### Main Config File

Add a `staticSite` section to your `vizzly.config.js`:

```javascript
// vizzly.config.js
export default {
  // Standard Vizzly config
  server: { port: 47392 },
  build: { environment: 'test' },

  // Static Site plugin config
  staticSite: {
    viewports: [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ],

    browser: {
      headless: true,
      args: ['--no-sandbox'],
    },

    screenshot: {
      fullPage: true,
      omitBackground: false,
    },

    // Concurrency auto-detected from CPU cores (min 2, max 8)
    // concurrency: 4,

    // Page filtering
    include: 'blog/**',
    exclude: '**/404.html',

    // Page discovery
    pageDiscovery: {
      useSitemap: true,
      sitemapPath: 'sitemap.xml',
      scanHtml: true,
    },
  },
};
```

### Interactions File (Optional)

For page-specific interactions and overrides, create a `vizzly.static-site.js` file:

```javascript
// vizzly.static-site.js
export default {
  // Interaction hooks - run before screenshots
  interactions: {
    'blog/*': async (page) => {
      await page.waitForSelector('.blog-content');
    },
    'products/*': async (page) => {
      await page.click('.view-details');
    },
  },

  // Per-page configuration overrides
  pages: {
    '/': {
      viewports: ['mobile', 'desktop'],
    },
    '/pricing': {
      screenshot: { fullPage: true },
    },
  },
};
```

## Configuration Priority

Configuration is merged in this order (later overrides earlier):

1. Default configuration
2. `config.staticSite` from vizzly.config.js
3. `vizzly.static-site.js` interactions and pages
4. CLI options

## CLI Options

- `--viewports <list>` - Comma-separated viewport definitions (format: `name:WxH`)
- `--concurrency <n>` - Number of parallel browser tabs (default: auto-detected based on CPU cores, min 2, max 8)
- `--include <pattern>` - Include page pattern (glob)
- `--exclude <pattern>` - Exclude page pattern (glob)
- `--browser-args <args>` - Additional Puppeteer browser arguments
- `--headless` - Run browser in headless mode (default: true)
- `--full-page` - Capture full page screenshots (default: true)
- `--no-full-page` - Capture viewport-only screenshots
- `--timeout <ms>` - Screenshot timeout in milliseconds (default: 45000)
- `--dry-run` - Print discovered pages and task count without capturing screenshots
- `--use-sitemap` - Use sitemap.xml for page discovery (default: true)
- `--sitemap-path <path>` - Path to sitemap.xml relative to build directory

## Page Discovery

The plugin discovers pages using two methods:

### 1. Sitemap.xml Parsing

Automatically discovers pages from sitemap.xml if available:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
  <url>
    <loc>https://example.com/blog/post-1</loc>
  </url>
</urlset>
```

### 2. HTML File Scanning

Recursively scans the build directory for .html files.

Both methods can be used together - the plugin will merge and deduplicate pages.

## Interaction Hooks

Interaction hooks allow you to interact with pages before capturing screenshots. Define these in `vizzly.static-site.js`:

### Pattern-Based Hooks

```javascript
// vizzly.static-site.js
export default {
  interactions: {
    'blog/*': async (page) => {
      // Apply to all blog pages
      await page.waitForSelector('.blog-content');
    },
    'products/*': async (page) => {
      // Apply to all product pages
      await page.click('.view-details');
      await page.waitForSelector('.product-modal');
    },
    '/': async (page) => {
      // Specific page
      await page.evaluate(() => window.scrollTo(0, 500));
    },
  },
};
```

### Named Hooks

Create reusable hooks that can be referenced in page configs:

```javascript
// vizzly.static-site.js
export default {
  interactions: {
    'scroll-to-footer': async (page) => {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    },
  },
  pages: {
    '/contact': {
      interaction: 'scroll-to-footer',
    },
  },
};
```

## Pattern Matching

Patterns support glob-like syntax:

- `*` - Match any characters except `/`
- `**` - Match any characters including `/`
- `blog/*` - Match all blog pages
- `docs/**` - Match all pages under docs
- `**/*.html` - Match all HTML files

## Screenshot Naming

Screenshots are named based on the page path, with viewport information stored as properties for better grouping:

**Name format:** `path-to-page` (slashes replaced with hyphens)

**Properties:** Viewport metadata (`viewport`, `viewportWidth`, `viewportHeight`)

Examples:
- Name: `index`, Properties: `{ viewport: 'mobile', viewportWidth: 375, viewportHeight: 667 }`
- Name: `blog-post-1`, Properties: `{ viewport: 'desktop', viewportWidth: 1920, viewportHeight: 1080 }`
- Name: `docs-getting-started`, Properties: `{ viewport: 'tablet', viewportWidth: 768, viewportHeight: 1024 }`

This approach allows Vizzly to group screenshots by viewport while keeping names clean and compatible with file system restrictions.

## Visual Development Workflow

This plugin integrates static sites into Vizzly's visual development workflow, enabling both local TDD iteration and seamless team collaboration. The plugin **automatically detects** which mode to use:

### TDD Mode (Local Development)

When a TDD server is running, screenshots are compared locally for fast iteration:

```bash
# Start TDD server
vizzly tdd start

# Capture screenshots (automatically uses TDD mode)
vizzly static-site ./dist

# View live results at http://localhost:47392
```

**Output:**
```
ℹ 📍 TDD mode: Using local server
ℹ 🌐 Found 12 pages in ./dist
ℹ    ✓ /@default
ℹ    ✓ /blog/post-1@default
ℹ ✅ Captured 12 screenshots successfully
```

### Run Mode (CI/CD & Cloud)

When a `VIZZLY_TOKEN` is set, screenshots are uploaded to the cloud for team review:

```bash
# Capture and upload to Vizzly cloud (automatically uses Run mode)
VIZZLY_TOKEN=your-token vizzly static-site ./dist
```

**Output:**
```
ℹ ☁️  Run mode: Uploading to cloud
ℹ 🔗 https://app.vizzly.dev/your-org/project/builds/...
ℹ 🌐 Found 12 pages in ./dist
ℹ    ✓ /@default
ℹ ✅ Captured 12 screenshots successfully
ℹ 🔗 View results: https://app.vizzly.dev/your-org/project/builds/...
```

### Mode Detection

The plugin automatically chooses the mode:

1. **TDD mode** - If a TDD server is running (`.vizzly/server.json` found)
2. **Run mode** - If `VIZZLY_TOKEN` environment variable is set
3. **Warning** - If neither is available, warns and skips screenshots

No need to wrap with `vizzly run` - the plugin handles everything!

## Supported Static Site Generators

- **Gatsby** - Build with `gatsby build`, output in `public/`
- **Astro** - Build with `astro build`, output in `dist/`
- **Jekyll** - Build with `jekyll build`, output in `_site/`
- **Next.js** - Static export with `next build && next export`, output in `out/`
- **Eleventy** - Build with `eleventy`, output in `_site/`
- **Hugo** - Build with `hugo`, output in `public/`
- **VuePress** - Build with `vuepress build`, output in `.vuepress/dist/`
- **Docusaurus** - Build with `docusaurus build`, output in `build/`
- **Any static site generator** that produces HTML files

## Example Workflows

### Gatsby

```bash
# Build Gatsby site
npm run build

# Capture screenshots
vizzly static-site ./public
```

### Astro

```bash
# Build Astro site
npm run build

# Capture screenshots with custom viewports
vizzly static-site ./dist --viewports "mobile:375x667,desktop:1920x1080"
```

### Next.js Static Export

```bash
# Build and export Next.js site
npm run build

# Capture screenshots
vizzly static-site ./out
```

### Jekyll

```bash
# Build Jekyll site
bundle exec jekyll build

# Capture only blog pages
vizzly static-site ./_site --include "blog/**"
```

## CI/CD Integration

```yaml
# .github/workflows/visual-tests.yml
name: Visual Tests

on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      # Build your static site
      - run: npm install
      - run: npm run build

      # Run visual tests
      - run: npx @vizzly-testing/cli static-site ./dist
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Troubleshooting

### Pages not found

Use `--dry-run` to see which pages are discovered without capturing screenshots:
```bash
vizzly static-site ./dist --dry-run
```

This shows pages grouped by source (sitemap vs HTML scan), the total screenshot count, and your current configuration.

Ensure your build has completed and check for sitemap.xml or HTML files:
```bash
ls dist/sitemap.xml
ls dist/**/*.html
```

### Browser launch fails

Try adding browser arguments:
```bash
vizzly static-site ./dist --browser-args "--no-sandbox,--disable-dev-shm-usage"
```

### Screenshots are blank

If your page needs time to render, use interaction hooks:
```javascript
interactions: {
  '**': async (page) => {
    await page.waitForSelector('.app-loaded', { visible: true });
  },
}
```

### Sitemap URLs don't match

The plugin automatically converts sitemap URLs to relative paths. If you have custom URL structures, use HTML scanning instead:

```javascript
pageDiscovery: {
  useSitemap: false,
  scanHtml: true,
}
```

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
