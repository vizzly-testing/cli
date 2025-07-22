# Getting Started with Vizzly CLI

## Installation

```bash
npm install -g @vizzly-testing/cli
# or
npx @vizzly-testing/cli
```

## Quick Start

### 1. Set up your API token

```bash
export VIZZLY_TOKEN=your-api-token
```

### 2. Upload existing screenshots

```bash
# Upload a directory of screenshots
npx vizzly upload ./screenshots

# Upload with metadata
npx vizzly upload ./screenshots --build-name "Release v1.2.3"
```

### 3. Integrate with your tests

```bash
# Run your test suite with Vizzly
npx vizzly run "npm test"

# Use TDD mode for local development
npx vizzly run "npm test" --tdd
```

### 4. In your test code

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

## Next Steps

- [Upload Command Guide](./upload-command.md)
- [Test Integration Guide](./test-integration.md)
- [TDD Mode Guide](./tdd-mode.md)
- [API Reference](./api-reference.md)
