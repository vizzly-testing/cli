# @vizzly-testing/storybook

Seamlessly integrate your Storybook stories into Vizzly's visual development workflow. Iterate
locally with `vizzly tdd`, automatically create team builds from CI/CD, and collaborate on visual
changes with position-based comments and review rules.

## Installation

```bash
npm install @vizzly-testing/storybook
```

The plugin is automatically discovered by the Vizzly CLI via the `@vizzly-testing/*` scope.

## Quick Start

### CLI Usage

```bash
# Capture screenshots from a static Storybook build
vizzly storybook ./storybook-static

# With custom viewports
vizzly storybook ./storybook-static \
  --viewports "mobile:375x667,tablet:768x1024,desktop:1920x1080"

# With filtering
vizzly storybook ./storybook-static \
  --include "components/**" \
  --exclude "**/*.deprecated"

# With concurrency control
vizzly storybook ./storybook-static --concurrency 5
```

### Programmatic Usage

```javascript
import { run } from '@vizzly-testing/storybook';

await run('./storybook-static', {
  viewports: 'mobile:375x667,desktop:1920x1080',
  concurrency: 3,
}, {
  logger: console,
});
```

## Configuration

### Config File

Create a `vizzly-storybook.config.js` file in your project root:

```javascript
export default {
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
    fullPage: false,
    omitBackground: false,
  },

  concurrency: 3,

  include: 'components/**',
  exclude: '**/*.test',

  interactions: {
    // Pattern-based hooks
    'Button/*': async (page) => {
      await page.hover('button');
    },
    'Tooltip/*': async (page) => {
      await page.click('.tooltip-trigger');
    },
  },
};
```

### Per-Story Configuration

You can configure specific stories by adding a `vizzly` parameter in your story files:

```javascript
// Button.stories.js
export let Primary = {
  args: { label: 'Click me' },
  parameters: {
    vizzly: {
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
      ],
      beforeScreenshot: async (page) => {
        await page.hover('button');
      },
    },
  },
};

export let Disabled = {
  args: { label: 'Disabled', disabled: true },
  parameters: {
    vizzly: {
      skip: true, // Don't screenshot this story
    },
  },
};
```

## Configuration Priority

Configuration is merged in this order (later overrides earlier):

1. Default configuration
2. Config file (`vizzly-storybook.config.js`)
3. CLI options
4. Per-story parameters

## CLI Options

- `--viewports <list>` - Comma-separated viewport definitions (format: `name:WxH`)
- `--concurrency <n>` - Number of parallel stories to process (default: 3)
- `--include <pattern>` - Include story pattern (glob)
- `--exclude <pattern>` - Exclude story pattern (glob)
- `--config <path>` - Path to custom config file
- `--browser-args <args>` - Additional Puppeteer browser arguments
- `--headless` - Run browser in headless mode (default: true)
- `--full-page` - Capture full page screenshots (default: false)

## Interaction Hooks

Interaction hooks allow you to interact with stories before capturing screenshots.

### Global Hooks (Pattern-Based)

```javascript
// vizzly-storybook.config.js
export default {
  interactions: {
    'Button/*': async (page) => {
      // Apply to all Button stories
      await page.hover('button');
    },
    'Form/*': async (page) => {
      // Apply to all Form stories
      await page.fill('input[name="email"]', 'test@example.com');
      await page.click('button[type="submit"]');
    },
    'Dropdown/WithOptions': async (page) => {
      // Specific story
      await page.click('.dropdown-toggle');
    },
  },
};
```

### Per-Story Hooks

```javascript
export let WithTooltip = {
  parameters: {
    vizzly: {
      beforeScreenshot: async (page) => {
        await page.hover('.info-icon');
        await page.waitForSelector('.tooltip', { visible: true });
      },
    },
  },
};
```

## Pattern Matching

Patterns support glob-like syntax:

- `*` - Match any characters except `/`
- `**` - Match any characters including `/`
- `Button/*` - Match all Button stories
- `components/**` - Match all stories under components
- `**/*.deprecated` - Match all deprecated stories

## Screenshot Naming

Screenshots are named using the format:

```
ComponentName/StoryName@viewportName
```

Examples:
- `Button/Primary@mobile`
- `Card/WithImage@desktop`
- `Components/Atoms/Input/Default@tablet`

## Visual Development Workflow

This plugin integrates Storybook into Vizzly's visual development workflow, enabling both local TDD
iteration and seamless team collaboration:

### TDD Mode (Local Development)

```bash
# Start TDD server
vizzly tdd start

# Capture Storybook screenshots
vizzly storybook ./storybook-static

# View results at http://localhost:47392
```

### Run Mode (CI/CD)

```bash
# Capture and upload to Vizzly cloud
VIZZLY_TOKEN=your-token vizzly run "vizzly storybook ./storybook-static"
```

## Supported Storybook Versions

- Storybook v6.x
- Storybook v7.x
- Storybook v8.x

## Example Workflow

1. Build your Storybook:
   ```bash
   npm run build-storybook
   ```

2. Capture screenshots with Vizzly:
   ```bash
   vizzly storybook ./storybook-static
   ```

3. Review in the Vizzly dashboard

## Troubleshooting

### Stories not found

Ensure your Storybook build has an `index.json` file:
```bash
ls storybook-static/index.json
```

### Browser launch fails

Try adding browser arguments:
```bash
vizzly storybook ./storybook-static --browser-args "--no-sandbox,--disable-dev-shm-usage"
```

### Screenshots are blank

If your component needs time to render, wait for specific elements from your component to appear:
```javascript
interactions: {
  '**': async (page) => {
    // Wait for your component's content to be visible
    await page.waitForSelector('.your-component-class', { visible: true });
  },
}
```

## License

MIT © [Stubborn Mule Software](https://vizzly.dev)
