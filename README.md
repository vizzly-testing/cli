# 🐻 Vizzly CLI

> Visual development workflow platform for UI teams

[![npm version](https://img.shields.io/npm/v/@vizzly-testing/cli.svg)](https://www.npmjs.com/package/@vizzly-testing/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Vizzly?

Vizzly makes visual quality part of your development process, not an afterthought. Iterate locally
with `vizzly tdd`, collaborate on automatic CI/CD builds, and ship with visual confidence.

Unlike tools that recreate your components in sandboxed environments, Vizzly works with screenshots
from your *actual* tests - whether that's Playwright in CI, BrowserStack for cross-browser testing,
or your local development environment. No rendering inconsistencies. No "it works in my app but not
in the testing tool."

The result? Visual quality integrated into development, not bolted on afterward.

## Features

- 🔄 **Local TDD Workflow** - Iterate on visual changes instantly with `vizzly tdd`, see exactly what changed as you code
- 💬 **Advanced Collaboration** - Position-based comments, review rules, mentions, and deep links for team coordination
- 🍯 **Honeydiff Engine** - Purpose-built diffing with dynamic content detection, SSIM scoring, and smart AA filtering
- 📸 **Flexible Screenshots** - Works with any screenshot source: Playwright, BrowserStack, Sauce Labs, local dev
- ✅ **Seamless CI/CD** - Automatic builds from every commit, no manual steps

## Quick Start

**Requirements:** Node.js 22 or newer.

> **Note:** Vizzly supports [active LTS versions](https://nodejs.org/en/about/previous-releases) of Node.js.

```bash
# Install globally
npm install -g @vizzly-testing/cli

# Initialize your project
vizzly init
```

### Authentication

**Local Development:**
```bash
vizzly login                    # OAuth login with your Vizzly account
vizzly project:select           # Optional: configure project token for this directory
```

**CI/CD:**
```bash
export VIZZLY_TOKEN=your-project-token
vizzly run "npm test"
```

See [authentication guide](./docs/authentication.md) for token priority and `.env` file setup.

### Basic Usage

**TDD Mode** (local development - the fast iteration loop):
```bash
vizzly tdd start                   # Start server, see changes in real-time
npm test -- --watch                # Run your tests
# Open dashboard at http://localhost:47392
```

**Run Mode** (CI/CD - for team collaboration):
```bash
vizzly run "npm test"              # Run tests, upload to cloud
vizzly run "npm test" --wait       # Wait for results, fail on visual changes
```

**In your test code:**
```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

const screenshot = await page.screenshot();
await vizzlyScreenshot('homepage', screenshot, {
  browser: 'chrome',
  viewport: '1920x1080'
});
```

See [test integration guide](./docs/test-integration.md) for Playwright, Cypress, and other frameworks.

## Client SDKs & Plugins

Vizzly provides specialized clients and plugins for various frameworks and languages:

### Official Client SDKs

- **[Ruby Client](./clients/ruby)** - Lightweight Ruby SDK for RSpec, Capybara, and other test frameworks
- **[Vitest Plugin](./clients/vitest)** - Drop-in replacement for Vitest's native visual testing with `toMatchScreenshot`
- **[Storybook Plugin](./clients/storybook)** - Capture screenshots from Storybook builds with interaction hooks
- **[Static Site Plugin](./clients/static-site)** - Visual testing for static sites (Gatsby, Astro, Next.js, Jekyll, etc.)

Each client is designed to integrate seamlessly with your existing workflow while providing the full
power of Vizzly's visual testing platform.

## Commands

### Core Commands

```bash
vizzly run "npm test"               # Run tests and upload to cloud
vizzly tdd start                    # Start local TDD server with dashboard
vizzly upload ./screenshots         # Upload existing screenshots
vizzly status <build-id>            # Check build status
vizzly init                         # Create vizzly.config.js
```

See [API reference](./docs/api-reference.md) for all options.

### Authentication

```bash
vizzly login                        # OAuth login
vizzly logout                       # Clear tokens
vizzly whoami                       # Show current user
vizzly project:select               # Configure project token for directory
```

See [authentication guide](./docs/authentication.md) for details.

## Configuration

```javascript
// vizzly.config.js
export default {
  server: { port: 47392 },
  comparison: { threshold: 0.1 },
  upload: { concurrency: 5 }
};
```

Run `vizzly init` to generate this file. See [API reference](./docs/api-reference.md) for all options.

## CI/CD Integration

Every commit creates a team build automatically - your development workflow becomes your review workflow.

**GitHub Actions:**
```yaml
- name: Visual Tests
  run: npx vizzly run "npm test" --wait
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

**Parallel builds** (for faster test suites):
```yaml
- run: npx vizzly run "npm test -- --shard=${{ matrix.shard }}" --parallel-id="${{ github.run_id }}"
- run: npx vizzly finalize "${{ github.run_id }}"  # After all shards complete
```

The `--wait` flag exits non-zero on visual changes, so your CI fails appropriately. See [CI/CD
examples](./docs/getting-started.md#cicd-integration) for GitLab, CircleCI, and more.

## Plugin System

Vizzly's plugin system allows extending the CLI with custom commands. Plugins under `@vizzly-testing/*` are auto-discovered:

```bash
npm install @vizzly-testing/storybook
vizzly storybook ./storybook-static   # Command automatically available
```

**Official Plugins:**
- **Claude Code** *(built-in)* - AI-powered debugging and test suggestions
- **[@vizzly-testing/storybook](./clients/storybook)** - Storybook screenshot capture
- **[@vizzly-testing/static-site](./clients/static-site)** - Static site testing
- **[@vizzly-testing/vitest](./clients/vitest)** - Vitest integration

See [plugin development guide](./docs/plugins.md) to create your own.

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Authentication Guide](./docs/authentication.md)
- [Test Integration Guide](./docs/test-integration.md)
- [TDD Mode Guide](./docs/tdd-mode.md)
- [API Reference](./docs/api-reference.md)
- [Plugin Development](./docs/plugins.md)

## Environment Variables

**Common:**
- `VIZZLY_TOKEN` - API authentication token (use `vizzly login` for local dev)
- `VIZZLY_PARALLEL_ID` - Identifier for parallel CI builds

**Git Overrides (for CI):**
- `VIZZLY_COMMIT_SHA`, `VIZZLY_COMMIT_MESSAGE`, `VIZZLY_BRANCH`, `VIZZLY_PR_NUMBER`

See [API reference](./docs/api-reference.md) for complete list.

## Contributing

We'd love your help making Vizzly better! Whether you're fixing bugs, adding features, or improving
docs - contributions are welcome. Check out the [GitHub repo](https://github.com/vizzly-testing/cli)
to get started.

## License

MIT © Stubborn Mule Software
