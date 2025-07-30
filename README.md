# Vizzly CLI

> Visual review platform for UI developers and designers

[![npm version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Vizzly?

Vizzly is a visual review platform designed for how modern teams work. Instead of recreating your components in a sandboxed environment, Vizzly captures screenshots directly from your functional tests. This means you test the *real thing*, not a snapshot.

It's fast because we don't render anything—we process the images you provide from any source. Bring screenshots from web apps, mobile apps, or even design mockups, and use our collaborative dashboard to streamline the review process between developers and designers.

## Features

- 📸 **Smart Screenshots** - Automatic deduplication and intelligent diffing
- 🎨 **Any Screenshot** - Web, mobile, desktop, design mockups, or any visual content
- 🏃 **TDD Mode** - Local visual comparison for rapid development
- 📊 **Beautiful Dashboard** - Intuitive web interface for reviewing changes
- 👥 **Team Collaboration** - Built for UI developers and designers to work together
- 🔄 **CI/CD Ready** - GitHub, GitLab, CircleCI, and more

## Quick Start

```bash
# Install globally
npm install -g @vizzly-testing/cli

# Or use npx
npx @vizzly-testing/cli upload ./screenshots
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
vizzly run "npm test" --tdd
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

> **Multi-Language Support**: Currently available as a JavaScript/Node.js SDK with Python, Ruby, and other language bindings coming soon. The client SDK is lightweight and simply POSTs screenshot data to the CLI for processing.

## Commands

### Upload Screenshots
```bash
vizzly upload <directory>           # Upload screenshots from directory
vizzly upload ./screenshots --wait  # Wait for processing
```

### Run Tests with Integration
```bash
vizzly run "npm test"               # Run with Vizzly integration
vizzly run "npm test" --tdd         # Local TDD mode
vizzly run "pytest" --port 3002     # Custom port
vizzly run "npm test" --wait        # Wait for build completion
vizzly run "npm test" --eager       # Create build immediately
vizzly run "npm test" --allow-no-token  # Run without API token
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
- `--eager` - Create build immediately (default: lazy creation)
- `--threshold <number>` - Comparison threshold (0-1, default: 0.01)

**Development & Testing:**
- `--tdd` - Enable TDD mode with local comparisons
- `--allow-no-token` - Allow running without API token (useful for local development)
- `--token <token>` - API token override

**Baseline Configuration:**
- `--baseline-build <id>` - Use specific build as baseline for comparisons
- `--baseline-comparison <id>` - Use specific comparison as baseline

### Other Commands
```bash
vizzly init                         # Initialize config file
vizzly status <build-id>            # Check build status
vizzly doctor                       # Run diagnostics
```

## TDD Mode

TDD mode enables fast local development by comparing screenshots locally without uploading to Vizzly:

```bash
# First run - downloads baselines
npx vizzly run "npm test" --tdd

# Subsequent runs use cached baselines
npx vizzly run "npm test" --tdd
```

- **🚀 Fast feedback**: No network uploads during development
- **💾 Local storage**: Baselines cached in `.vizzly/` directory
- **⚡ Quick iteration**: No API rate limits or upload delays

## Configuration

Create a `vizzly.config.js` file:

```javascript
export default {
  apiUrl: 'https://vizzly.dev',
  server: { port: 47392 },
  build: { environment: 'test' },
  comparison: { threshold: 0.01 }
};
```

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

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Upload Command Guide](./docs/upload-command.md)
- [Test Integration Guide](./docs/test-integration.md)
- [TDD Mode Guide](./docs/tdd-mode.md)
- [API Reference](./docs/api-reference.md)

## Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation, your help makes Vizzly better for everyone.

### Getting Started

1. Fork the repository on [GitHub](https://github.com/vizzly/cli)
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

Found a bug or have a feature request? Please [open an issue](https://github.com/vizzly/cli/issues) with:

- A clear description of the problem or request
- Steps to reproduce (for bugs)
- Your environment details (OS, Node.js version, etc.)

### Development Setup

The CLI is built with modern JavaScript and requires Node.js 20+ (LTS). See the development scripts in `package.json` for available commands.

## License

MIT © Stubborn Mule Software
