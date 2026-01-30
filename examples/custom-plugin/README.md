# Example Vizzly Plugin

This is an example plugin demonstrating how to extend the Vizzly CLI with custom commands.

## What This Plugin Does

This example plugin adds several commands to demonstrate different plugin capabilities:

- `vizzly hello` - Simple greeting command
- `vizzly greet <name>` - Command with arguments and options
- `vizzly check-api` - Command that accesses Vizzly services
- `vizzly list-screenshots` - Command with file system operations

## Installation

Since this is an example, you can use it locally without publishing:

### Option 1: Local Path in Config

Add to your `vizzly.config.js`:

```javascript
export default {
  plugins: [
    './examples/custom-plugin/plugin.js'
  ]
};
```

### Option 2: Symlink to node_modules

```bash
# From the vizzly-cli root
npm link

# Create symlink for the plugin
cd examples/custom-plugin
npm link @vizzly-testing/cli
cd ../..
mkdir -p node_modules/@vizzly-testing
ln -s ../../examples/custom-plugin node_modules/@vizzly-testing/example-plugin
```

## Usage

After installation, run:

```bash
# See the new commands in help
vizzly --help

# Try the commands
vizzly hello
vizzly greet "World" --loud
vizzly check-api
vizzly list-screenshots
```

## Plugin Structure

The plugin exports an object with:

- **`name`** - Unique identifier for the plugin
- **`version`** - Plugin version (optional but recommended)
- **`register(program, context)`** - Function called during CLI initialization

### Register Function

The `register` function receives:

1. **`program`** - Commander.js program instance for adding commands
2. **`context`** - Object containing:
   - `config` - Merged Vizzly configuration
   - `output` - Output utilities for consistent CLI output
   - `services` - Service container (see below)

### Services API

The `services` object provides stable APIs for plugins:

```javascript
let { git, testRunner, serverManager } = services;

// Git detection (v0.25.0+) - handles CI environments correctly
let gitInfo = await git.detect({ buildPrefix: 'MyPlugin' });
// Returns: { branch, commit, message, prNumber, buildName }

// Build lifecycle
let buildId = await testRunner.createBuild(options);
await testRunner.finalizeBuild(buildId, wait, success, executionTime);

// Server control
await serverManager.start(buildId, tddMode, setBaseline);
await serverManager.stop();
```

## Creating Your Own Plugin

1. Create a new directory for your plugin
2. Create `package.json` with `vizzly.plugin` field:

```json
{
  "name": "@vizzly-testing/my-plugin",
  "vizzly": {
    "plugin": "./plugin.js"
  }
}
```

3. Create `plugin.js` with your plugin logic:

```javascript
export default {
  name: 'my-plugin',
  version: '1.0.0',
  register(program, { config, logger, services }) {
    program
      .command('my-command')
      .description('My custom command')
      .action(() => {
        logger.info('Running my command!');
      });
  }
};
```

4. Test locally using `vizzly.config.js`:

```javascript
export default {
  plugins: ['./path/to/your/plugin.js']
};
```

5. Publish to npm under `@vizzly-testing/*` scope for auto-discovery

## Learn More

- [Plugin Documentation](../../docs/plugins.md)
- [Vizzly CLI Documentation](https://vizzly.dev/docs)
