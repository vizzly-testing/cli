# @vizzly-testing/storybook

Capture screenshots of your Storybook stories and review changes with Vizzly.
Works with Storybook 6–10.

## Get started

```bash
pnpm install -D @vizzly-testing/cli @vizzly-testing/storybook
pnpm run build-storybook
vizzly tdd start --open
vizzly storybook ./storybook-static
```

Vizzly finds the plugin automatically. If a local TDD server is running,
screenshots go there. Otherwise, set `VIZZLY_TOKEN` to upload them for review:

```bash
VIZZLY_TOKEN=your-token vizzly storybook ./storybook-static
```

Without a server or token, the plugin warns and skips screenshots. You don't
need to wrap it in `vizzly run`.

For Storybook 10, use ESM config and presets. See the
[Storybook migration guide](https://storybook.js.org/docs/releases/migration-guide)
for upgrade details.

## Configuration

Add `storybook` to `vizzly.config.js`, or run `vizzly init` to get started:

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
`storybook` config → CLI options → per-story parameters.

## Per-story settings

Use `parameters.vizzly` for viewports and hooks. Add `tags: ['vizzly-skip']`
to skip a story:

```javascript
export let Primary = {
  args: { label: 'Click me' },
  parameters: {
    vizzly: {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
      beforeScreenshot: async (page) => {
        await page.hover('button');
      },
    },
  },
};

export let Disabled = {
  args: { label: 'Disabled', disabled: true },
  tags: ['vizzly-skip'],
};
```

`parameters.vizzly.screenshot` accepts `properties`, `threshold`,
`minClusterSize`, `fullPage`, `omitBackground`, `timeout`, and `requestTimeout`.
The older `parameters.vizzly.skip` option still works.

Use `interactions` in config to run hooks for a group of stories, or
`beforeScreenshot` for one story. If a component loads content after rendering,
wait for it before taking the screenshot:

```javascript
beforeScreenshot: async (page) => {
  await page.hover('.info-icon');
  await page.waitForSelector('.tooltip');
},
```

## CLI options

```bash
vizzly storybook ./storybook-static --viewports "mobile:375x667,desktop:1920x1080"
vizzly storybook ./storybook-static --include "components/**" --exclude "**/*.deprecated"
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

```javascript
import { run } from '@vizzly-testing/storybook';

await run('./storybook-static', {
  viewports: 'mobile:375x667,desktop:1920x1080',
  concurrency: 4,
}, {
  output: console,
});
```

## Troubleshooting

- **No stories found:** Check that the build contains `index.json`.
- **Browser won't launch in CI:** Try
  `--browser-args "--no-sandbox,--disable-dev-shm-usage"`.
- **Blank screenshots:** Add a hook that waits for the component's content,
  such as `await page.waitForSelector('.your-component-class')`.

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
