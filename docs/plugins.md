# Vizzly Plugin System

The Vizzly CLI supports a powerful plugin system that allows you to extend its functionality with
custom commands. This enables packages like `@vizzly-testing/storybook` to ship independently while
integrating seamlessly with the CLI.

## Overview

Plugins are npm packages that export a simple registration function. The CLI automatically discovers
plugins from `node_modules/@vizzly-testing/*` or loads them explicitly from your config file.

## Benefits

- **Zero Configuration** - Just `npm install` and the plugin is available
- **Shared Infrastructure** - Plugins get access to config, logger, and services
- **Independent Releases** - Plugins can iterate without requiring CLI updates
- **Smaller Core** - Keep the main CLI lean by moving optional features to plugins
- **Extensible** - Community can build and share plugins

## Creating a Plugin

### Basic Plugin Structure

A plugin is a JavaScript module that exports an object with `name`, optional `version`, and a `register` function:

```javascript
// plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0',

  register(program, { config, logger, services }) {
    // Register your command with Commander.js
    program
      .command('my-command <arg>')
      .description('Description of my command')
      .option('--option <value>', 'An option')
      .action(async (arg, options) => {
        logger.info(`Running my-command with ${arg}`);

        // Access shared services
        let apiService = await services.get('apiService');

        // Your command logic here
      });
  }
};
```

### Plugin Interface

#### Required Fields

- **`name`** (string) - Unique identifier for your plugin
- **`register`** (function) - Called during CLI initialization

#### Optional Fields

- **`version`** (string) - Plugin version (recommended for debugging)

#### Register Function Parameters

The `register` function receives two arguments:

1. **`program`** - Commander.js program instance for registering commands
2. **`context`** - Object containing:
   - `config` - Merged Vizzly configuration
   - `logger` - Shared logger instance
   - `services` - Service container with API client, uploader, etc.

### Available Services

Plugins can access these services from the container:

- **`logger`** - Component logger for consistent output
- **`apiService`** - Vizzly API client
- **`uploader`** - Screenshot upload service
- **`buildManager`** - Build lifecycle management
- **`serverManager`** - Screenshot server management
- **`tddService`** - TDD mode services
- **`testRunner`** - Test execution service

Example accessing a service:

```javascript
register(program, { config, logger, services }) {
  program
    .command('upload-storybook')
    .action(async () => {
      let uploader = await services.get('uploader');
      await uploader.uploadScreenshots(screenshots);
    });
}
```

## Publishing a Plugin

### 1. Package Structure

```
@vizzly-testing/my-plugin/
├── package.json
├── plugin.js       # Main plugin file
├── lib/            # Plugin implementation
└── README.md
```

### 2. Package.json Configuration

Add a `vizzly.plugin` field pointing to your plugin entry file:

```json
{
  "name": "@vizzly-testing/my-plugin",
  "version": "1.0.0",
  "description": "Vizzly plugin for ...",
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

### 3. Publish to npm

Plugins must be published under the `@vizzly-testing` scope to be auto-discovered:

```bash
npm publish --access public
```

## Using Plugins

### Auto-Discovery (Recommended)

Plugins under `@vizzly-testing/*` are automatically discovered:

```bash
# Install plugin
npm install @vizzly-testing/storybook

# Use immediately - no configuration needed!
vizzly storybook ./storybook-static

# Plugin commands appear in help
vizzly --help
```

### Explicit Configuration

You can also explicitly configure plugins in `vizzly.config.js`:

```javascript
export default {
  plugins: [
    '@vizzly-testing/my-plugin',  // Package name
    './custom-plugin.js',          // Local file path
  ],
};
```

This is useful for:
- Local plugin development
- Private/unpublished plugins
- Third-party plugins not under the `@vizzly-testing` scope
- Controlling plugin load order (though rarely needed)

## Plugin Development

### Local Development Setup

1. Create your plugin directory:

```bash
mkdir my-plugin
cd my-plugin
npm init
```

2. Create `plugin.js`:

```javascript
export default {
  name: 'my-plugin',
  version: '1.0.0',
  register(program, { config, logger, services }) {
    program
      .command('my-command')
      .description('My custom command')
      .action(async () => {
        logger.info('Hello from my plugin!');
      });
  }
};
```

3. Test locally by adding to config:

```javascript
// vizzly.config.js
export default {
  plugins: ['./my-plugin/plugin.js'],
};
```

4. Run `vizzly --help` to see your command

### Best Practices

#### Error Handling

Always handle errors gracefully:

```javascript
register(program, { config, logger }) {
  program
    .command('my-command')
    .action(async () => {
      try {
        // Your logic
      } catch (error) {
        logger.error(`Command failed: ${error.message}`);
        process.exit(1);
      }
    });
}
```

#### Logging

Use the provided logger for consistent output:

```javascript
logger.debug('Detailed debug info');
logger.info('Normal information');
logger.warn('Warning message');
logger.error('Error message');
```

#### Async Operations

Use async/await for asynchronous operations:

```javascript
.action(async (options) => {
  let service = await services.get('apiService');
  await service.doSomething();
});
```

#### Command Naming

Choose clear, descriptive command names that don't conflict with core commands:

- ✅ `vizzly storybook`
- ✅ `vizzly import-chromatic`
- ❌ `vizzly run` (conflicts with core)
- ❌ `vizzly upload` (conflicts with core)

#### Validation

Validate user input and provide helpful error messages:

```javascript
.action(async (path, options) => {
  if (!existsSync(path)) {
    logger.error(`Path not found: ${path}`);
    process.exit(1);
  }

  // Continue with logic
});
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
      .action((name) => {
        logger.info(`Hello, ${name}!`);
      });
  }
};
```

### Screenshot Upload Plugin

```javascript
export default {
  name: 'storybook',
  version: '1.0.0',
  register(program, { config, logger, services }) {
    program
      .command('storybook <path>')
      .description('Capture Storybook screenshots')
      .option('--viewports <list>', 'Comma-separated viewports')
      .action(async (path, options) => {
        logger.info(`Crawling Storybook at ${path}`);

        // Import heavy dependencies only when needed
        let { crawlStorybook } = await import('./crawler.js');

        // Capture screenshots
        let screenshots = await crawlStorybook(path, {
          viewports: options.viewports?.split(',') || ['1280x720'],
          logger,
        });

        // Use uploader service
        let uploader = await services.get('uploader');
        await uploader.uploadScreenshots(screenshots);

        logger.info(`Uploaded ${screenshots.length} screenshots`);
      });
  }
};
```

## Troubleshooting

### Plugin Not Discovered

Check that:
1. Package is under `@vizzly-testing/*` scope
2. `package.json` has `vizzly.plugin` field
3. Plugin path in `vizzly.plugin` exists and is relative
4. Plugin exports valid structure

Run with `--verbose` to see plugin loading debug logs:

```bash
vizzly --verbose --help
```

### Plugin Registration Fails

Check browser/terminal for error messages. Common issues:
- Missing `name` or `register` function
- Syntax errors in plugin code
- Missing dependencies

### Plugin Command Not Showing

Ensure:
- Command was registered with `program.command()`
- Plugin loaded successfully (check `--verbose` output)
- No command name conflicts with core commands

## Plugin Ecosystem

### Official Plugins

- **[@vizzly-testing/storybook](https://npmjs.com/package/@vizzly-testing/storybook)** - Storybook
  screenshot capture

### Community Plugins

Want to share your plugin? Open a PR to add it to this list!

## Support

- [GitHub Issues](https://github.com/vizzly-testing/cli/issues)
- [Documentation](https://docs.vizzly.dev/)
- [Discord Community](https://discord.gg/vizzly)
