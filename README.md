# Vizzly CLI

> Visual review platform for UI developers and designers

[![npm version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Vizzly?

Vizzly is a visual review platform designed for how modern teams work. Instead of recreating your
components in a sandboxed environment, Vizzly captures screenshots directly from your functional
tests. This means you test the *real thing*, not a snapshot.

It's fast because we don't render anything—we process the images you provide from any source. Bring
screenshots from web apps, mobile apps, or even design mockups, and use our collaborative dashboard
to streamline the review process between developers and designers.

## Features

- 📸 **Smart Screenshots** - Automatic deduplication and intelligent diffing
- 🎨 **Any Screenshot** - Web, mobile, desktop, design mockups, or any visual content
- 🏃 **TDD Mode** - Local visual comparison for rapid development
- 📊 **Beautiful Dashboard** - Intuitive web interface for reviewing changes
- 👥 **Team Collaboration** - Built for UI developers and designers to work together
- 🔄 **CI/CD Ready** - GitHub, GitLab, CircleCI, and more

## Quick Start

Requirements: Node.js 20 or newer.

```bash
# Install globally
npm install -g @vizzly-testing/cli

# Initialize your project
vizzly init
```

### Set up your API token

For local development, create a `.env` file in your project root and add your token:

```
VIZZLY_TOKEN=your-api-token
```

Then add `.env` to your `.gitignore` file. For CI/CD, use your provider's secret management system.

### Upload existing screenshots

```bash
vizzly upload ./screenshots --build-name "Release v1.2.3"
```

### Integrate with your tests

```bash
# Run tests with Vizzly integration
vizzly run "npm test"

# Use TDD mode for local development
vizzly tdd run "npm test"
```

### In your test code

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

// Your test framework takes the screenshot
const screenshot = await page.screenshot();

// Send to Vizzly for review
await vizzlyScreenshot('homepage', screenshot, {
  browser: 'chrome',
  viewport: '1920x1080'
});
```

> **Multi-Language Support**: Currently available as a JavaScript/Node.js SDK with Python, Ruby, and
> other language bindings coming soon. The client SDK is lightweight and simply POSTs screenshot
> data to the CLI for processing.

## Commands

### Upload Screenshots
```bash
vizzly upload <directory>           # Upload screenshots from directory
vizzly upload ./screenshots --wait  # Wait for processing
vizzly upload ./screenshots --upload-all  # Upload all without deduplication
vizzly upload ./screenshots --parallel-id "ci-run-123"  # For parallel CI builds
```

### Run Tests with Integration
```bash
vizzly run "npm test"               # Run with Vizzly integration
vizzly run "pytest" --port 3002     # Custom port
vizzly run "npm test" --wait        # Wait for build completion
vizzly run "npm test" --allow-no-token  # Run without API token
vizzly run "npm test" --parallel-id "ci-run-123"  # For parallel CI builds
```

#### Run Command Options

**Server Configuration:**
- `--port <port>` - Port for screenshot server (default: 47392)
- `--timeout <ms>` - Server timeout in milliseconds (default: 30000)

**Build Configuration:**
- `-b, --build-name <name>` - Custom build name
- `--branch <branch>` - Git branch override
- `--commit <sha>` - Git commit SHA override
- `--message <msg>` - Commit message
- `--environment <env>` - Environment name (default: test)

**Processing Options:**
- `--wait` - Wait for build completion and exit with appropriate code
- `--threshold <number>` - Comparison threshold (0-1, default: 0.01)
- `--upload-timeout <ms>` - Upload wait timeout in ms
- `--upload-all` - Upload all screenshots without SHA deduplication

**Parallel Execution:**
- `--parallel-id <id>` - Unique identifier for parallel test execution (also via `VIZZLY_PARALLEL_ID`)

**Development & Testing:**
- `--allow-no-token` - Allow running without API token (useful for local development)
- `--token <token>` - API token override

## TDD Command

For local visual testing with immediate feedback, use the dedicated `tdd` command:

```bash
# Start interactive TDD dashboard (runs in background)
vizzly tdd start

# Run your tests in watch mode (same terminal or new one)
npm test -- --watch

# View the dashboard at http://localhost:47392
```

**Interactive Dashboard:** The TDD dashboard provides real-time visual feedback:
- **Live Updates** - See comparisons as tests run
- **Visual Diff Modes** - Overlay, side-by-side, onion skin, and toggle views
- **Baseline Management** - Accept/reject changes directly from the UI
- **Test Statistics** - Real-time pass/fail metrics
- **Dark Theme** - Easy on the eyes during long sessions

**TDD Subcommands:**

```bash
# Start the TDD dashboard server
vizzly tdd start [options]

# Run tests in single-shot mode
vizzly tdd run "npm test" [options]

# Stop a running TDD server
vizzly tdd stop
```

**TDD Command Options:**
- `--set-baseline` - Accept current screenshots as new baseline
- `--baseline-build <id>` - Use specific build as baseline (requires API token)
- `--threshold <number>` - Comparison threshold (0-1, default: 0.1)
- `--port <port>` - Server port (default: 47392)
- `--timeout <ms>` - Server timeout (default: 30000)
- `--open` - Auto-open dashboard in browser (start command only)

### Setup and Status Commands
```bash
vizzly init                         # Create vizzly.config.js with defaults
vizzly status <build-id>            # Check build progress and results
vizzly status <build-id> --verbose  # Detailed build information
vizzly status <build-id> --json     # Machine-readable output
vizzly finalize <parallel-id>       # Finalize parallel build after all shards complete
vizzly doctor                       # Fast local preflight (no network)
vizzly doctor --api                 # Include API connectivity checks
```

#### Init Command
Creates a basic `vizzly.config.js` configuration file with sensible defaults. No interactive
prompts - just generates a clean config you can customize.

```bash
vizzly init           # Create config file
vizzly init --force   # Overwrite existing config
```

#### Status Command
Check the progress and results of your builds. Shows comprehensive information including:
- Build status and progress
- Screenshot and comparison counts (new, changed, identical)
- Git branch and commit details
- Direct web dashboard link
- Timing and execution information

```bash
# Basic status check
vizzly status abc123-def456-build-id

# Detailed information for debugging
vizzly status abc123-def456-build-id --verbose

# JSON output for CI/CD integration
vizzly status abc123-def456-build-id --json
```

### Doctor
- Purpose: Quickly validate your local setup without network calls by default.
- Checks: Node.js version (>= 20), `apiUrl` format, comparison `threshold`, effective `port` (default 47392).
- Optional: Add `--api` to verify connectivity using your `VIZZLY_TOKEN`.

Examples:
```bash
# Local-only checks
vizzly doctor

# Include API connectivity
VIZZLY_TOKEN=your-token vizzly doctor --api

# JSON output for tooling
vizzly doctor --json
```

The dedicated `tdd` command provides fast local development with immediate visual feedback. See the
[TDD Mode Guide](./docs/tdd-mode.md) for complete details on local visual testing.

## Configuration

Create a `vizzly.config.js` file with `vizzly init` or manually:

```javascript
export default {
  // API configuration
  // Set VIZZLY_TOKEN environment variable or uncomment and set here:
  // apiToken: 'your-token-here',

  // Screenshot configuration
  screenshots: {
    directory: './screenshots',
    formats: ['png']
  },

  // Server configuration
  server: {
    port: 47392,
    screenshotPath: '/screenshot'
  },

  // Comparison configuration
  comparison: {
    threshold: 0.1,
    ignoreAntialiasing: true
  },

  // Upload configuration
  upload: {
    concurrency: 5,
    timeout: 30000
  }
};
```

Run `vizzly init` to generate this file automatically with sensible defaults.

## Config Reference

For the full configuration schema and CLI options, see docs/api-reference.md.

## Framework Examples

### Playwright
```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage test', async ({ page }) => {
  await page.goto('/');
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot, {
    browser: 'chrome',
    viewport: '1920x1080'
  });
});
```

### Cypress
```javascript
// cypress/support/commands.js
Cypress.Commands.add('vizzlyScreenshot', (name, properties = {}) => {
  cy.screenshot(name, { capture: 'viewport' });
  cy.readFile(`cypress/screenshots/${name}.png`, 'base64').then((imageBase64) => {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    return vizzlyScreenshot(name, imageBuffer, {
      browser: Cypress.browser.name,
      ...properties
    });
  });
});
```

## CI/CD Integration

For CI/CD pipelines, use the `--wait` flag to wait for visual comparison results and get appropriate exit codes:

### GitHub Actions
```yaml
- name: Visual Tests
  run: npx vizzly run "npm test" --wait
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
    # Optional: Provide correct git information from GitHub context
    VIZZLY_COMMIT_MESSAGE: ${{ github.event.pull_request.head.commit.message || github.event.head_commit.message }}
    VIZZLY_COMMIT_SHA: ${{ github.event.pull_request.head.sha || github.event.head_commit.id }}
    VIZZLY_BRANCH: ${{ github.head_ref || github.ref_name }}
```

### Parallel Builds in CI

For parallel test execution, use `--parallel-id` to ensure all shards contribute to the same build:

```yaml
# GitHub Actions with parallel matrix
jobs:
  e2e-tests:
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - name: Run tests with Vizzly
        run: |
          npx vizzly run "npm test -- --shard=${{ matrix.shard }}" \
            --parallel-id="${{ github.run_id }}-${{ github.run_attempt }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}

  finalize-e2e:
    needs: e2e-tests
    runs-on: ubuntu-latest
    if: always() && needs.e2e-tests.result == 'success'
    steps:
      - name: Finalize parallel build
        run: |
          npx vizzly finalize "${{ github.run_id }}-${{ github.run_attempt }}"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

### GitLab CI
```yaml
visual-tests:
  stage: test
  image: node:20
  script:
    - npm ci
    - npx vizzly run "npm test" --wait
  variables:
    VIZZLY_TOKEN: $VIZZLY_TOKEN
```

The `--wait` flag ensures the process:
- Waits for all screenshots to be processed
- Exits with code `1` if visual differences are detected
- Exits with code `0` if all comparisons pass
- Allows your CI to fail appropriately when visual regressions occur

## API Reference

### `vizzlyScreenshot(name, imageBuffer, properties)`
Send a screenshot to Vizzly.
- `name` (string): Screenshot identifier
- `imageBuffer` (Buffer): Image data
- `properties` (object): Metadata for organization

### `isVizzlyEnabled()`
Check if Vizzly is enabled in the current environment.

## Plugin Ecosystem

Vizzly supports a powerful plugin system that allows you to extend the CLI with custom
commands. Plugins are automatically discovered from `@vizzly-testing/*` packages or can be
explicitly configured.

### Official Plugins

- **[@vizzly-testing/storybook](https://npmjs.com/package/@vizzly-testing/storybook)** *(coming
  soon)* - Capture screenshots from Storybook builds

### Using Plugins

Plugins under the `@vizzly-testing/*` scope are auto-discovered:

```bash
# Install plugin
npm install @vizzly-testing/storybook

# Use immediately - commands are automatically available!
vizzly storybook ./storybook-static

# Plugin commands show in help
vizzly --help
```

### Creating Plugins

You can create your own plugins to add custom commands:

```javascript
// plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  register(program, { config, logger, services }) {
    program
      .command('my-command')
      .description('My custom command')
      .action(async () => {
        logger.info('Running my command!');
      });
  }
};
```

Add to your `vizzly.config.js`:

```javascript
export default {
  plugins: ['./plugin.js']
};
```

See the [Plugin Development Guide](./docs/plugins.md) for complete documentation and examples.

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Upload Command Guide](./docs/upload-command.md)
- [Test Integration Guide](./docs/test-integration.md)
- [TDD Mode Guide](./docs/tdd-mode.md)
- [Plugin Development](./docs/plugins.md)
- [API Reference](./docs/api-reference.md)
- [Doctor Command](./docs/doctor-command.md)

## Environment Variables

### Core Configuration
- `VIZZLY_TOKEN`: API authentication token. Example: `export VIZZLY_TOKEN=your-token`.
- `VIZZLY_API_URL`: Override API base URL. Default: `https://app.vizzly.dev`.
- `VIZZLY_LOG_LEVEL`: Logger level. One of `debug`, `info`, `warn`, `error`. Example: `export VIZZLY_LOG_LEVEL=debug`.

### Parallel Builds
- `VIZZLY_PARALLEL_ID`: Unique identifier for parallel test execution. Example: `export VIZZLY_PARALLEL_ID=ci-run-123`.

### Git Information Override
For enhanced CI/CD integration, you can override git detection with these environment variables:

- `VIZZLY_COMMIT_SHA`: Override detected commit SHA. Useful in CI environments.
- `VIZZLY_COMMIT_MESSAGE`: Override detected commit message. Useful in CI environments.
- `VIZZLY_BRANCH`: Override detected branch name. Useful in CI environments.
- `VIZZLY_PR_NUMBER`: Override detected pull request number. Useful for PR-specific builds.

**Example for GitHub Actions:**
```yaml
env:
  VIZZLY_COMMIT_MESSAGE: ${{ github.event.pull_request.head.commit.message || github.event.head_commit.message }}
  VIZZLY_COMMIT_SHA: ${{ github.event.pull_request.head.sha || github.event.head_commit.id }}
  VIZZLY_BRANCH: ${{ github.head_ref || github.ref_name }}
  VIZZLY_PR_NUMBER: ${{ github.event.pull_request.number }}
```

These variables take highest priority over both CLI arguments and automatic git detection.

## Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation,
your help makes Vizzly better for everyone.

### Getting Started

1. Fork the repository on [GitHub](https://github.com/vizzly-testing/cli)
2. Clone your fork locally: `git clone https://github.com/your-username/cli.git`
3. Install dependencies: `npm install`
4. Run tests to ensure everything works: `npm test`

### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes and **add tests** for any new functionality
3. Run the linter: `npm run lint`
4. Run tests: `npm test`
5. Commit your changes using [gitmoji](https://gitmoji.dev/) format: `git commit -m '✨ Add your feature'`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

### Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/vizzly-testing/cli/issues) with:

- A clear description of the problem or request
- Steps to reproduce (for bugs)
- Your environment details (OS, Node.js version, etc.)

### Development Setup

The CLI is built with modern JavaScript and requires Node.js 20+ (LTS). See the development scripts
in `package.json` for available commands.

## License

MIT © Stubborn Mule Software
