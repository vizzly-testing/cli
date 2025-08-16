# API Reference

This document provides comprehensive reference for all Vizzly CLI APIs, including the client library, SDK, and command-line interface.

## Client API (`@vizzly-testing/cli/client`)

The client API is a lightweight library for capturing screenshots in your tests.

### `vizzlyScreenshot(name, imageBuffer, options)`

Capture a screenshot for visual regression testing.

**Parameters:**
- `name` (string) - Unique screenshot identifier
- `imageBuffer` (Buffer) - PNG image data as Buffer
- `options` (object, optional) - Configuration and metadata

**Options:**
```javascript
{
  // Comparison settings
  threshold: 0.01,           // Pixel difference threshold (0-1)
  
  // Metadata for organization (all optional)
  properties: {
    browser: 'chrome',       // Browser name
    viewport: '1920x1080',   // Viewport size
    device: 'desktop',       // Device type
    component: 'header',     // UI component name
    page: 'home',           // Page identifier
    theme: 'dark',          // Theme/variant
    userType: 'admin',      // User context
    state: 'logged-in',     // Application state
    environment: 'staging', // Environment
    // ... any custom metadata
  }
}
```

**Returns:** `Promise<void>`

**Example:**
```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

const screenshot = await page.screenshot();
await vizzlyScreenshot('homepage', screenshot, {
  threshold: 0.02,
  properties: {
    browser: 'chrome',
    viewport: '1920x1080',
    component: 'hero-section'
  }
});
```

### `vizzlyFlush()`

Wait for all queued screenshots to be processed.

**Returns:** `Promise<void>`

**Example:**
```javascript
import { vizzlyFlush } from '@vizzly-testing/cli/client';

// Take multiple screenshots
await vizzlyScreenshot('page1', screenshot1);
await vizzlyScreenshot('page2', screenshot2);

// Wait for all to be processed
await vizzlyFlush();
```

### `isVizzlyEnabled()`

Check if Vizzly screenshot capture is currently enabled.

**Returns:** `boolean`

**Example:**
```javascript
import { isVizzlyEnabled } from '@vizzly-testing/cli/client';

if (isVizzlyEnabled()) {
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('conditional-screenshot', screenshot);
}
```

### `getVizzlyInfo()`

Get current Vizzly environment information and settings.

**Returns:** `object`
```javascript
{
  enabled: boolean,        // Whether Vizzly is active
  serverUrl: string,       // Local server URL
  buildId: string,         // Current build ID
  tddMode: boolean,        // Whether TDD mode is active
  version: string          // Client version
}
```

**Example:**
```javascript
import { getVizzlyInfo } from '@vizzly-testing/cli/client';

const info = getVizzlyInfo();
console.log(`Vizzly ${info.enabled ? 'enabled' : 'disabled'}`);
console.log(`TDD Mode: ${info.tddMode}`);
console.log(`Build ID: ${info.buildId}`);
```

### `configure(config)`

Configure client settings (advanced usage).

**Parameters:**
- `config` (object) - Configuration options

**Config Options:**
```javascript
{
  serverUrl: string,       // Override server URL
  enabled: boolean,        // Enable/disable capture
  timeout: number,         // Request timeout (ms)
  retries: number          // Number of retry attempts
}
```

**Example:**
```javascript
import { configure } from '@vizzly-testing/cli/client';

configure({
  serverUrl: 'http://localhost:3001',
  enabled: true,
  timeout: 10000
});
```

### `setEnabled(enabled)`

Enable or disable screenshot capture.

**Parameters:**
- `enabled` (boolean) - Whether to enable capture

**Example:**
```javascript
import { setEnabled } from '@vizzly-testing/cli/client';

// Disable screenshots for this test
setEnabled(false);
await runTest();

// Re-enable
setEnabled(true);
```

## SDK API (`@vizzly-testing/cli/sdk`)

The SDK provides comprehensive programmatic access to Vizzly functionality.

### `createVizzly(config, options)`

Create a new Vizzly SDK instance.

**Parameters:**
- `config` (object) - Vizzly configuration
- `options` (object, optional) - SDK options

**Returns:** `VizzlySDK` instance

**Example:**
```javascript
import { createVizzly } from '@vizzly-testing/cli/sdk';

const vizzly = createVizzly({
  apiKey: process.env.VIZZLY_TOKEN,
  project: 'my-project'
});
```

### `VizzlySDK` Class

The main SDK class that extends `EventEmitter`.

#### Methods

##### `start()`
Start the Vizzly server and initialize the SDK.

**Returns:** `Promise<void>`

##### `stop()`
Stop the Vizzly server and cleanup resources.

**Returns:** `Promise<void>`

##### `screenshot(name, imageBuffer, options)`
Capture a screenshot (same as client API).

**Returns:** `Promise<void>`

##### `upload(options)`
Upload screenshots to Vizzly.

**Parameters:**
- `options` (object) - Upload configuration

**Options:**
```javascript
{
  screenshotsDir: string,  // Directory containing screenshots
  buildName: string,       // Build name
  environment: string,     // Environment name
  wait: boolean           // Wait for completion
}
```

##### `compare(name, imageBuffer)`
Run local comparison (TDD mode).

**Returns:** `Promise<ComparisonResult>`

##### `getConfig()`
Get current SDK configuration.

**Returns:** `object` - Current configuration

#### Events

The SDK emits various events for monitoring:

```javascript
vizzly.on('server:started', (port) => {
  console.log(`Server started on port ${port}`);
});

vizzly.on('server:stopped', () => {
  console.log('Server stopped');
});

vizzly.on('screenshot:captured', (name, metadata) => {
  console.log(`Screenshot captured: ${name}`);
});

vizzly.on('upload:progress', (progress) => {
  console.log(`Upload progress: ${progress.completed}/${progress.total}`);
});

vizzly.on('upload:completed', (buildId) => {
  console.log(`Upload completed: ${buildId}`);
});

vizzly.on('upload:failed', (error) => {
  console.error('Upload failed:', error);
});

vizzly.on('comparison:completed', (result) => {
  console.log(`Comparison completed: ${result.name}`);
});

vizzly.on('comparison:failed', (error) => {
  console.error('Comparison failed:', error);
});
```

## CLI Commands

### `vizzly upload <path>`

Upload screenshots from a directory.

**Arguments:**
- `<path>` - Path to screenshots directory

**Options:**
- `-b, --build-name <name>` - Build name
- `-m, --metadata <json>` - Additional metadata as JSON
- `--branch <branch>` - Git branch override
- `--commit <sha>` - Git commit SHA override
- `--message <msg>` - Commit message override
- `--environment <env>` - Environment name (default: "test")
- `--threshold <number>` - Comparison threshold (0-1)
- `--token <token>` - API token override
- `--wait` - Wait for build completion
- `--upload-all` - Upload all screenshots without SHA deduplication

**Exit Codes:**
- `0` - Success (all approved or no changes)
- `1` - Changes detected (requires review)
- `2` - Upload failed or error

### `vizzly run <command>`

Run tests with Vizzly integration.

**Arguments:**
- `<command>` - Test command to execute

**Options:**

*Server Configuration:*
- `--port <port>` - Server port (default: 47392)
- `--timeout <ms>` - Server timeout in milliseconds (default: 30000)

*Build Configuration:*
- `-b, --build-name <name>` - Custom build name
- `--branch <branch>` - Git branch override
- `--commit <sha>` - Git commit SHA override
- `--message <msg>` - Commit message override
- `--environment <env>` - Environment name (default: "test")

*Processing Options:*
- `--wait` - Wait for build completion and exit with appropriate code
- `--threshold <number>` - Comparison threshold (0-1, default: 0.01)
- `--upload-timeout <ms>` - Upload wait timeout in ms (default: from config or 30000)
- `--upload-all` - Upload all screenshots without SHA deduplication

*Development & Testing:*
- `--allow-no-token` - Allow running without API token
- `--token <token>` - API token override


**Environment Variables Set:**
- `VIZZLY_SERVER_URL` - Local server URL
- `VIZZLY_BUILD_ID` - Current build ID
- `VIZZLY_ENABLED` - Set to "true"
- `VIZZLY_TDD_MODE` - "true" if TDD mode active

**Exit Codes:**
- `0` - Success
- `1` - Visual differences detected (when using `--wait`)
- `2` - Build failed or error

### `vizzly tdd <command>`

Run tests in TDD mode with local visual comparisons.

**Arguments:**
- `<command>` - Test command to execute

**Options:**

*Server Configuration:*
- `--port <port>` - Server port (default: 47392)
- `--timeout <ms>` - Server timeout in milliseconds (default: 30000)

*Baseline Management:*
- `--set-baseline` - Accept current screenshots as new baseline (overwrites existing)
- `--baseline-build <id>` - Use specific build as baseline (requires API token)
- `--baseline-comparison <id>` - Use specific comparison as baseline (requires API token)

*Build Configuration:*
- `--branch <branch>` - Git branch override
- `--environment <env>` - Environment name (default: "test")
- `--threshold <number>` - Comparison threshold (0-1, default: 0.1)
- `--token <token>` - API token override

**Behavior:**
- 🐻 **No API token**: Auto-detected, runs in local-only mode
- 🐻 **First run**: Creates local baseline from screenshots
- 🐻 **Subsequent runs**: Compares against local baseline, **tests fail on differences**
- 🐻 **`--set-baseline`**: Accepts current screenshots as new baseline

**Environment Variables Set:**
- `VIZZLY_SERVER_URL` - Local server URL
- `VIZZLY_BUILD_ID` - Current build ID
- `VIZZLY_ENABLED` - Set to "true"
- `VIZZLY_SET_BASELINE` - "true" if `--set-baseline` used

**Exit Codes:**
- `0` - Success (no visual differences or baseline update mode)
- `1` - Visual differences detected (comparison failed)
- `2` - TDD mode failed or error

### `vizzly init [directory]`

Initialize Vizzly configuration.

**Arguments:**
- `[directory]` - Target directory (default: current)

**Options:**
- `--force` - Overwrite existing configuration

**Generated Files:**
- `vizzly.config.js` - Configuration file

### `vizzly status <build-id>`

Check build status.

**Arguments:**
- `<build-id>` - Build ID to check

**Exit Codes:**
- `0` - Build completed successfully
- `1` - Build has changes requiring review
- `2` - Build failed or error

### `vizzly doctor`

Run environment diagnostics.

**Checks:**
- Node.js version (>= 20.0.0)
- npm installation  
- Package.json existence
- Vizzly configuration loading
- API connectivity (if token available)
- Required dependencies
- File permissions
- Port availability

## Global CLI Options

Available on all commands:

- `-c, --config <path>` - Config file path
- `--token <token>` - Vizzly API token
- `-v, --verbose` - Verbose output
- `--json` - Machine-readable JSON output
- `--no-color` - Disable colored output

## Configuration

### File Locations

Configuration loaded via cosmiconfig in this order:

1. Command line `--config` option
2. `vizzly.config.js`
3. `.vizzlyrc.js`
4. `vizzly` key in `package.json`
5. Environment variables
6. CLI option overrides

### Configuration Schema

```javascript
{
  // API Configuration
  apiKey: string,              // API token (from VIZZLY_TOKEN)
  apiUrl: string,              // API base URL (default: 'https://vizzly.dev')
  project: string,             // Project ID override

  // Server Configuration (for run command)
  server: {
    port: number,              // Server port (default: 47392)
    timeout: number,           // Timeout in ms (default: 30000)
    screenshotPath: string     // Screenshot endpoint path
  },

  // Build Configuration
  build: {
    name: string,              // Build name template
    environment: string        // Environment name (default: 'test')
  },

  // Upload Configuration (for upload command)
  upload: {
    screenshotsDir: string,    // Screenshots directory (default: './screenshots')
    batchSize: number,         // Upload batch size (default: 10)
    timeout: number,           // Upload timeout in ms (default: 30000)
    retries: number            // Retry attempts (default: 3)
  },

  // Comparison Configuration
  comparison: {
    threshold: number,         // Pixel difference threshold (default: 0.01)
    ignoreAntialiasing: boolean, // Ignore antialiasing (default: true)
    ignoreColors: boolean      // Ignore color differences (default: false)
  }
}
```

### Environment Variables

**Core Configuration:**
- `VIZZLY_TOKEN` - API authentication token
- `VIZZLY_API_URL` - API base URL override
- `VIZZLY_LOG_LEVEL` - Logger level (`debug`, `info`, `warn`, `error`)

**Git Information Override (CI/CD Enhancement):**
- `VIZZLY_COMMIT_SHA` - Override detected commit SHA
- `VIZZLY_COMMIT_MESSAGE` - Override detected commit message
- `VIZZLY_BRANCH` - Override detected branch name

**Runtime (Set by CLI):**
- `VIZZLY_SERVER_URL` - Screenshot server URL (set by CLI)
- `VIZZLY_ENABLED` - Enable/disable client (set by CLI)
- `VIZZLY_BUILD_ID` - Current build ID (set by CLI)
- `VIZZLY_TDD_MODE` - TDD mode active (set by CLI)

**Priority Order for Git Information:**
1. CLI arguments (`--commit`, `--branch`, `--message`)
2. `VIZZLY_*` environment variables
3. CI-specific environment variables (e.g., `GITHUB_SHA`, `CI_COMMIT_SHA`)
4. Git command detection

## Error Handling

### Client Errors

```javascript
try {
  await vizzlyScreenshot('test', screenshot);
} catch (error) {
  if (error.code === 'VIZZLY_DISABLED') {
    // Vizzly is disabled, skip screenshot
  } else if (error.code === 'VIZZLY_SERVER_UNAVAILABLE') {
    // Server not reachable
  } else {
    // Other error
    throw error;
  }
}
```

### Common Error Codes

- `VIZZLY_DISABLED` - Screenshot capture disabled
- `VIZZLY_SERVER_UNAVAILABLE` - Local server not reachable
- `VIZZLY_INVALID_IMAGE` - Invalid image buffer provided
- `VIZZLY_UPLOAD_FAILED` - Upload to Vizzly failed
- `VIZZLY_COMPARISON_FAILED` - Local comparison failed
- `VIZZLY_TOKEN_MISSING` - API token not provided
- `VIZZLY_TOKEN_INVALID` - API token invalid or expired

## TypeScript Support

The CLI includes comprehensive TypeScript definitions:

```typescript
import { vizzlyScreenshot, VizzlyOptions, VizzlyInfo } from '@vizzly-testing/cli/client';

const options: VizzlyOptions = {
  threshold: 0.01,
  properties: {
    browser: 'chrome',
    viewport: '1920x1080'
  }
};

await vizzlyScreenshot('homepage', screenshot, options);

const info: VizzlyInfo = getVizzlyInfo();
```

## Migration Guide

### From Direct API Usage

If you were using direct API calls:

```javascript
// Before
await fetch('https://api.vizzly.dev/screenshots', {
  method: 'POST',
  body: formData
});

// After
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';
await vizzlyScreenshot('homepage', screenshot);
```

### From Other Visual Testing Tools

The Vizzly client API is designed to be a drop-in replacement:

```javascript
// Percy
await percy.snapshot('homepage');

// Vizzly equivalent
await vizzlyScreenshot('homepage', screenshot);
```

## Best Practices

### Screenshot Naming
- Use descriptive, consistent names
- Include page/component context
- Avoid spaces and special characters

### Metadata Organization
- Use consistent property names across tests
- Include browser/device information
- Add environment context

### Performance
- Don't take unnecessary screenshots
- Use appropriate image sizes
- Consider test execution time

### Error Handling
- Check if Vizzly is enabled before capturing
- Handle network failures gracefully
- Log errors for debugging

## Support

For additional help:

- Check [Getting Started Guide](./getting-started.md)
- Review [Test Integration Guide](./test-integration.md)
- Explore [TDD Mode Guide](./tdd-mode.md)
- Report issues at [GitHub Issues](https://github.com/vizzly-testing/cli/issues)
