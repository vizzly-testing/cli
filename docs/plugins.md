# Vizzly Plugin System

The Vizzly CLI supports a powerful plugin system that allows you to extend its functionality with
custom commands. This enables community contributions and specialized integrations while keeping the
core CLI lean and focused.

## Overview

Plugins are JavaScript modules that export a simple registration function. The CLI automatically
discovers plugins from `node_modules/@vizzly-testing/*` or loads them explicitly from your config
file.

## Benefits

- **Zero Configuration** - Just `npm install` and the plugin is available
- **Shared Infrastructure** - Plugins get access to config, logger, and services
- **Independent Releases** - Plugins can iterate without requiring CLI updates
- **Smaller Core** - Keep the main CLI lean by moving optional features to plugins
- **Community Extensible** - Anyone can build and share plugins

## Using Plugins

### Official Plugins

#### Claude Code Integration (Built-in)

Vizzly includes a built-in plugin for [Claude Code](https://claude.com/code), providing AI-powered visual testing workflows:

**Installation via Claude Code:**
```
/plugin marketplace add vizzly-testing/cli
```

**Available Commands:**
- `/vizzly:tdd-status` - Check TDD dashboard status with AI insights
- `/vizzly:debug-diff <screenshot-name>` - Analyze visual failures with AI assistance
- `/vizzly:suggest-screenshots` - Get framework-specific test coverage suggestions
- `/vizzly:setup` - Interactive setup wizard for Vizzly configuration

The plugin automatically detects whether you're in local TDD mode or working with cloud builds, providing contextual help for your workflow.

**Features:**
- MCP (Model Context Protocol) server for tool integration
- 15+ specialized tools for local TDD and cloud API workflows
- Intelligent context detection and mode switching
- Image analysis without API errors (safe baseline/current image handling)

**Location:** `.claude-plugin/` directory in the repository

#### Other Official Plugins

Official Vizzly plugins are published under the `@vizzly-testing/*` scope and are automatically
discovered:

```bash
# Install plugin
npm install @vizzly-testing/storybook

# Use immediately - no configuration needed!
vizzly storybook ./storybook-static

# Plugin commands appear in help
vizzly --help
```

### Community Plugins

You can use community plugins or your own local plugins by configuring them explicitly:

```javascript
// vizzly.config.js
export default {
  plugins: [
    './my-custom-plugin.js',        // Local file path
    'npm-package-name',             // npm package name
  ],
};
```

This is useful for:
- Local plugin development and testing
- Private/internal company plugins
- Community plugins not in the `@vizzly-testing` scope
- Custom workflow automation

## Creating a Plugin

### Basic Plugin Structure

A plugin is a JavaScript module that exports an object with `name` and a `register` function:

```javascript
// my-plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0', // Optional but recommended

  register(program, { config, logger, services }) {
    // Register your command with Commander.js
    program
      .command('my-command <arg>')
      .description('Description of my command')
      .option('--option <value>', 'An option')
      .action(async (arg, options) => {
        logger.info(`Running my-command with ${arg}`);

        // Access shared services if needed
        let apiService = await services.get('apiService');

        // Your command logic here
      });
  }
};
```

### Plugin Interface

#### Required Fields

- **`name`** (string) - Unique identifier for your plugin
- **`register`** (function) - Called during CLI initialization to register commands

#### Optional Fields

- **`version`** (string) - Plugin version (recommended for debugging and compatibility)

#### Register Function Parameters

The `register` function receives two arguments:

1. **`program`** - [Commander.js](https://github.com/tj/commander.js) program instance for registering commands
2. **`context`** - Object containing:
   - `config` - Merged Vizzly configuration object
   - `logger` - Shared logger instance with `.debug()`, `.info()`, `.warn()`, `.error()` methods
   - `services` - Service container with access to internal Vizzly services

### Available Services

Plugins can access these services from the container:

- **`logger`** - Component logger for consistent output
- **`apiService`** - Vizzly API client for interacting with the platform
- **`uploader`** - Screenshot upload service
- **`buildManager`** - Build lifecycle management
- **`serverManager`** - Screenshot server management
- **`tddService`** - TDD mode services
- **`testRunner`** - Test execution service

Example accessing a service:

```javascript
register(program, { config, logger, services }) {
  program
    .command('upload-screenshots <dir>')
    .action(async (dir) => {
      let uploader = await services.get('uploader');
      await uploader.uploadScreenshots(screenshots);
    });
}
```

## Local Plugin Development

### Setup

1. Create your plugin file:

```bash
mkdir -p plugins
touch plugins/my-plugin.js
```

2. Write your plugin:

```javascript
// plugins/my-plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  register(program, { config, logger }) {
    program
      .command('greet <name>')
      .description('Greet someone')
      .action((name) => {
        logger.info(`Hello, ${name}!`);
      });
  }
};
```

3. Configure Vizzly to load your plugin:

```javascript
// vizzly.config.js
export default {
  plugins: ['./plugins/my-plugin.js'],
};
```

4. Test your plugin:

```bash
vizzly --help          # See your command listed
vizzly greet World     # Test your command
```

### Package Structure (For Distribution)

If you want to share your plugin via npm:

```
my-vizzly-plugin/
├── package.json
├── plugin.js          # Main plugin file
├── lib/               # Plugin implementation
├── README.md
└── tests/
```

Add a `vizzly.plugin` field to your `package.json`:

```json
{
  "name": "vizzly-plugin-custom",
  "version": "1.0.0",
  "description": "My custom Vizzly plugin",
  "main": "./lib/index.js",
  "vizzly": {
    "plugin": "./plugin.js"
  },
  "keywords": ["vizzly", "vizzly-plugin"],
  "peerDependencies": {
    "@vizzly-testing/cli": "^0.9.0"
  }
}
```

Users can then install and use your plugin:

```bash
npm install vizzly-plugin-custom
```

```javascript
// vizzly.config.js
export default {
  plugins: ['vizzly-plugin-custom'],
};
```

## Best Practices

### Error Handling

Always handle errors gracefully and provide helpful error messages:

```javascript
register(program, { logger }) {
  program
    .command('process <file>')
    .action(async (file) => {
      try {
        if (!existsSync(file)) {
          logger.error(`File not found: ${file}`);
          process.exit(1);
        }
        // Process file...
      } catch (error) {
        logger.error(`Failed to process file: ${error.message}`);
        process.exit(1);
      }
    });
}
```

### Logging

Use the provided logger for consistent output across all CLI commands:

```javascript
logger.debug('Detailed debug info');   // Only shown with --verbose
logger.info('Normal information');     // Standard output
logger.warn('Warning message');        // Warning output
logger.error('Error message');         // Error output
```

### Async Operations

Use async/await for asynchronous operations:

```javascript
.action(async (options) => {
  let service = await services.get('apiService');
  let result = await service.doSomething();
  logger.info(`Result: ${result}`);
});
```

### Command Naming

Choose clear, descriptive command names that don't conflict with core commands:

✅ **Good command names:**
- `vizzly storybook`
- `vizzly import-chromatic`
- `vizzly generate-report`

❌ **Avoid these (conflicts with core):**
- `vizzly run`
- `vizzly upload`
- `vizzly init`
- `vizzly tdd`

### Input Validation

Validate user input and provide helpful error messages:

```javascript
.action(async (path, options) => {
  if (!path) {
    logger.error('Path is required');
    process.exit(1);
  }

  if (!existsSync(path)) {
    logger.error(`Path not found: ${path}`);
    logger.info('Please provide a valid path to your build directory');
    process.exit(1);
  }

  // Continue with logic
});
```

### Lazy Loading

Import heavy dependencies only when needed to keep CLI startup fast:

```javascript
register(program, { logger }) {
  program
    .command('process-images <dir>')
    .action(async (dir) => {
      // Only import when command runs
      let { processImages } = await import('./heavy-dependency.js');
      await processImages(dir);
    });
}
```

## Examples

### Simple Command Plugin

```javascript
export default {
  name: 'hello',
  version: '1.0.0',
  register(program, { logger }) {
    program
      .command('hello <name>')
      .description('Say hello')
      .option('-l, --loud', 'Say it loudly')
      .action((name, options) => {
        let greeting = `Hello, ${name}!`;
        if (options.loud) {
          greeting = greeting.toUpperCase();
        }
        logger.info(greeting);
      });
  }
};
```

### Screenshot Capture Plugin

```javascript
export default {
  name: 'storybook',
  version: '1.0.0',
  register(program, { config, logger, services }) {
    program
      .command('storybook <path>')
      .description('Capture screenshots from Storybook build')
      .option('--viewports <list>', 'Comma-separated viewports', '1280x720')
      .action(async (path, options) => {
        logger.info(`Crawling Storybook at ${path}`);

        // Import dependencies lazily
        let { crawlStorybook } = await import('./crawler.js');

        // Capture screenshots
        let screenshots = await crawlStorybook(path, {
          viewports: options.viewports.split(','),
          logger,
        });

        logger.info(`Captured ${screenshots.length} screenshots`);

        // Upload using Vizzly's uploader service
        let uploader = await services.get('uploader');
        await uploader.uploadScreenshots(screenshots);

        logger.info('Upload complete!');
      });
  }
};
```

### Multi-Command Plugin

```javascript
export default {
  name: 'reports',
  version: '1.0.0',
  register(program, { logger }) {
    let reports = program
      .command('reports')
      .description('Report generation commands');

    reports
      .command('generate')
      .description('Generate a new report')
      .action(() => {
        logger.info('Generating report...');
      });

    reports
      .command('list')
      .description('List all reports')
      .action(() => {
        logger.info('Listing reports...');
      });
  }
};
```

## Troubleshooting

### Plugin Not Loading

**Check plugin configuration:**

```bash
vizzly --verbose --help
```

This will show debug output about plugin loading.

**Common issues:**
- File path is incorrect (should be relative to `vizzly.config.js`)
- Plugin file has syntax errors
- Missing `export default` statement

### Plugin Command Not Showing

**Verify plugin loaded successfully:**

```bash
vizzly --verbose --help 2>&1 | grep -i plugin
```

**Common issues:**
- Missing `name` or `register` function
- Command name conflicts with existing commands
- Plugin threw an error during registration

### Type Errors in Editor

If you're using TypeScript or want better IDE support, you can add JSDoc types:

```javascript
/**
 * @param {import('commander').Command} program
 * @param {Object} context
 * @param {Object} context.config
 * @param {Object} context.logger
 * @param {Object} context.services
 */
function register(program, { config, logger, services }) {
  // Your plugin code with full autocomplete!
}

export default {
  name: 'my-plugin',
  register,
};
```

## Contributing a Plugin

### Share Your Plugin

Built a useful plugin? We'd love to feature it! Here's how to share:

1. **Publish to npm** (optional but recommended for reusability)
2. **Add documentation** - Include a clear README with usage examples
3. **Open an issue** on the [Vizzly CLI repository](https://github.com/vizzly-testing/cli/issues) with:
   - Plugin name and description
   - Link to repository or npm package
   - Usage example
   - Screenshots/demo if applicable

### Plugin Ideas

Here are some plugin ideas the community might find useful:

- **Playwright integration** - Automated screenshot capture from Playwright tests
- **Cypress integration** - Screenshot capture from Cypress tests
- **Percy migration** - Import screenshots from Percy
- **Chromatic migration** - Import screenshots from Chromatic
- **Figma comparison** - Compare designs with Figma files
- **Image optimization** - Compress screenshots before upload
- **Custom reporters** - Generate custom HTML/PDF reports
- **CI/CD integrations** - Specialized workflows for different CI platforms

## Support

Need help building a plugin?

- 📖 [View example plugin source](https://github.com/vizzly-testing/cli/tree/main/examples/custom-plugin)
- 🐛 [Report issues](https://github.com/vizzly-testing/cli/issues)
- 📧 [Email support](https://vizzly.dev/support/)
