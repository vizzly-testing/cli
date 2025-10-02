# Getting Started with Vizzly CLI

## Installation

```bash
npm install -g @vizzly-testing/cli
# or
npx @vizzly-testing/cli
```

## Quick Start

### Requirements

- Node.js 20 or newer

### 1. Initialize your project

```bash
npx vizzly init
```

This creates a basic `vizzly.config.js` file with sensible defaults.

### 2. Set up your API token

```bash
export VIZZLY_TOKEN=your-api-token
```

### 3. Verify your setup

Run a fast local preflight:

```bash
npx vizzly doctor
```

Optionally, include API connectivity:

```bash
VIZZLY_TOKEN=your-api-token npx vizzly doctor --api
```

### 4. Upload existing screenshots

```bash
# Upload a directory of screenshots
npx vizzly upload ./screenshots

# Upload with metadata
npx vizzly upload ./screenshots --build-name "Release v1.2.3"
```

### 5. Integrate with your tests

```bash
# Run your test suite with Vizzly
npx vizzly run "npm test"

# Use TDD mode for local development
npx vizzly tdd run "npm test"
```

### 6. In your test code

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

// Take a screenshot with your test framework
const screenshot = await page.screenshot();

// Send to Vizzly
await vizzlyScreenshot('homepage', screenshot, {
  browser: 'chrome',
  viewport: '1920x1080'
});
```

### 7. Check build status

After running tests or uploading screenshots, check your build status:

```bash
# Check status of a specific build
npx vizzly status your-build-id

# Get detailed information
npx vizzly status your-build-id --verbose

# JSON output for automation
npx vizzly status your-build-id --json
```

The status command shows:
- Build progress and completion status
- Screenshot and comparison counts
- Direct link to view results in the web dashboard
- Git branch and commit information
- Timing and execution details

## Next Steps

- [Upload Command Guide](./upload-command.md)
- [Test Integration Guide](./test-integration.md)
- [TDD Mode Guide](./tdd-mode.md)
- [API Reference](./api-reference.md)
If you’re using a self-hosted or preview API, override the base URL:

```bash
export VIZZLY_API_URL=https://your-api.example.com
```
