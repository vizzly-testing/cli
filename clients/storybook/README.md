# @vizzly-testing/storybook

Capture screenshots of your Storybook stories and review changes with Vizzly.
Your static build must include `index.json` and `iframe.html`.

## Get started

You need Node.js 22.18+ on Node 22, or Node.js 24+.

```bash
pnpm install -D @vizzly-testing/cli @vizzly-testing/storybook playwright-core@^1.63.0
pnpm exec playwright-core install chromium
pnpm run build-storybook
pnpm exec vizzly tdd start --open
pnpm exec vizzly storybook ./storybook-static
```

Use the same `playwright-core` version as the plugin so its browser installer
matches the browser used for capture.

Vizzly finds the plugin automatically. If a local TDD server is running,
screenshots go there. Otherwise, set `VIZZLY_TOKEN` to upload them for review:

```bash
VIZZLY_TOKEN=your-token pnpm exec vizzly storybook ./storybook-static
```

Without a server or token, the plugin warns and doesn't upload results. You
don't need to wrap it in `vizzly run`.

For Storybook 10, use ESM config and presets. See the
[Storybook migration guide](https://storybook.js.org/docs/releases/migration-guide)
for upgrade details.

## Configuration

Run `pnpm exec vizzly init --quick` to create a config, then add `storybook`:

```javascript
export default {
  comparison: { threshold: 0.1, minClusterSize: 2 },
  storybook: {
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
    include: 'components/**',
    exclude: '**/*.test',
    interactions: {
      'Button/*': async (page) => {
        await page.hover('button');
      },
    },
  },
};
```

Put comparison settings at the top level and capture settings under
`storybook`. Vizzly runs captures in parallel using half your CPU cores, with
a minimum of 2 and maximum of 8. Set `concurrency` to choose another number.

Later settings override earlier ones: defaults →
`storybook` config → CLI options → per-story settings in `index.json`.

## Skip stories and run hooks

Add `tags: ['vizzly-skip']` to skip a story:

```javascript
export let Disabled = {
  args: { label: 'Disabled', disabled: true },
  tags: ['vizzly-skip'],
};
```

Put hooks in `storybook.interactions` in `vizzly.config.js`. Patterns can match
one story or a group. For example, wait for a tooltip before capture:

```javascript
export default {
  storybook: {
    interactions: {
      'Tooltip/Visible': async (page) => {
        await page.hover('.info-icon');
        await page.waitForSelector('.tooltip');
      },
    },
  },
};
```

The plugin reads per-story settings only from `index.json`. If your build
includes `parameters.vizzly` there, JSON-compatible settings such as `viewports`,
`skip`, and `screenshot` can override the config. Functions declared in story
parameters aren't available through that JSON file, so keep hooks in config.

## CLI options

```bash
pnpm exec vizzly storybook ./storybook-static --viewports "mobile:375x667,desktop:1920x1080"
pnpm exec vizzly storybook ./storybook-static --include "components/**" --exclude "**/*.deprecated"
```

| Option | What it does |
| --- | --- |
| `--viewports <list>` | Comma-separated `name:WxH` viewports. |
| `--concurrency <n>` | Number of parallel stories. Default: half your CPU cores, 2–8. |
| `--browser <type>` | `chromium`, `firefox`, or `webkit`. |
| `--include <pattern>` / `--exclude <pattern>` | Filter stories. |
| `--config <path>` | Use a custom config file. |
| `--browser-args <args>` | Comma-separated Playwright browser arguments. |
| `--headless` / `--no-headless` | Hide or show the browser. Default: hidden. |
| `--full-page` / `--no-full-page` | Capture the full page or just the viewport. Default: full page. |
| `--timeout <ms>` | Screenshot timeout. Default: `45000`. |
| `--request-timeout <ms>` | Timeout for sending a screenshot to Vizzly. |

Use `Button/*` for Button stories and `components/**` for nested stories.
`*` matches within a path segment; `**` also matches across `/`.

## Screenshot names

Screenshots are named `ComponentName-StoryName@viewportName`, like
`Button-Primary@mobile` or `Card-WithImage@desktop`.

## From JavaScript

For local capture, start `pnpm exec vizzly tdd start --open` in the project
first, then run this script from the same project:

```javascript
import { run } from '@vizzly-testing/storybook';

await run('./storybook-static', {
  viewports: 'mobile:375x667,desktop:1920x1080',
  concurrency: 4,
}, {
  output: console,
});
```

This example uses the options shown; it doesn't load `vizzly.config.js`. Use
the CLI for cloud builds, where it supplies the config and build services.

## Troubleshooting

- **No stories found:** Check that the build contains `index.json`.
- **Browser won't launch:** Run `pnpm exec playwright-core install chromium`.
  In Linux CI, use `pnpm exec playwright-core install --with-deps chromium` to
  install system dependencies too. The plugin already supplies Chromium's
  sandbox and shared-memory flags.
- **Blank screenshots:** Add a hook that waits for the component's content,
  such as `await page.waitForSelector('.your-component-class')`.

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
