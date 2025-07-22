# Test Integration Guide

The `vizzly run` command integrates Vizzly directly into your test suite, automatically capturing screenshots during test execution and processing them through Vizzly's visual comparison pipeline.

## Command Options

**`--build-name <name>`** - Custom build name
```bash
vizzly run "npm test" --build-name "PR-123"
```

**`--environment <env>`** - Environment name (default: "test")
```bash
vizzly run "npm test" --environment "staging"
```

**`--branch <branch>`** - Git branch override
```bash
vizzly run "npm test" --branch "feature/new-ui"
```

**`--commit <sha>`** - Git commit SHA override
```bash
vizzly run "npm test" --commit "abc123def456"
```

**`--message <msg>`** - Commit message override
```bash
vizzly run "npm test" --message "Add new component"
```## Basic Usage

```bash
vizzly run "<your-test-command>"
```

Examples with different test frameworks:

```bash
vizzly run "npm test"
vizzly run "npx playwright test"
vizzly run "npx cypress run"
vizzly run "bundle exec rspec"
vizzly run "python -m pytest"
```

## How It Works

When you run `vizzly run`:

1. **Starts a local server** - Creates a screenshot capture endpoint
2. **Sets environment variables** - Makes Vizzly available to your tests
3. **Runs your test command** - Executes your normal test suite
4. **Captures screenshots** - Collects screenshots from `vizzlyScreenshot()` calls
5. **Uploads results** - Sends all screenshots to Vizzly for processing

## Environment Variables

The CLI automatically sets these variables for your test process:

- `VIZZLY_SERVER_URL` - Local server URL for screenshot uploads
- `VIZZLY_BUILD_ID` - Unique identifier for this test run
- `VIZZLY_ENABLED` - Set to `true` to enable screenshot capture
- `VIZZLY_TDD_MODE` - Set to `true` when using `--tdd` flag

## Adding Screenshots to Tests

Import the client and use `vizzlyScreenshot()` in your tests:

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

// Your test framework takes the screenshot
const screenshot = await page.screenshot();

// Send to Vizzly
await vizzlyScreenshot('homepage', screenshot, {
  properties: {
    browser: 'chrome',
    viewport: '1920x1080'
  }
});
```

## Framework Examples

### Playwright

```javascript
import { test } from '@playwright/test';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage test', async ({ page }) => {
  await page.goto('/');
  
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot, {
    properties: {
      browser: 'chrome',
      viewport: '1920x1080',
      page: 'home'
    }
  });
});
```

### Cypress

```javascript
// cypress/support/commands.js
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

Cypress.Commands.add('vizzlyScreenshot', (name, properties = {}) => {
  cy.screenshot(name, { capture: 'viewport' });
  
  cy.readFile(`cypress/screenshots/${name}.png`, 'base64').then((imageBase64) => {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    return vizzlyScreenshot(name, imageBuffer, {
      properties: {
        browser: Cypress.browser.name,
        framework: 'cypress',
        ...properties
      }
    });
  });
});

// In your test
describe('Homepage', () => {
  it('should render correctly', () => {
    cy.visit('/');
    cy.vizzlyScreenshot('homepage', {
      page: 'home',
      state: 'logged-out'
    });
  });
});
```

### Puppeteer

```javascript
import puppeteer from 'puppeteer';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

describe('Visual tests', () => {
  test('homepage screenshot', async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('/');
    
    const screenshot = await page.screenshot();
    await vizzlyScreenshot('homepage', screenshot, {
      properties: {
        browser: 'chrome',
        framework: 'puppeteer'
      }
    });
    
    await browser.close();
  });
});
```

## Command Options

### Server Configuration

**`--port <port>`** - Server port (default: 47392)
```bash
vizzly run "npm test" --port 3002
```

**`--timeout <ms>`** - Server timeout in milliseconds (default: 30000)
```bash
vizzly run "npm test" --timeout 60000
```

### Build Configuration

**`--build-name <name>`** - Custom build name
```bash
vizzly run "npm test" --build-name "PR-123"
```

**`--environment <env>`** - Environment name (default: "test")
```bash
vizzly run "npm test" --environment "staging"
```

**`--branch <branch>`** - Git branch override
```bash
vizzly run "npm test" --branch "feature/new-ui"
```

### Processing Options

**`--wait`** - Wait for build completion
```bash
vizzly run "npm test" --wait
```

**`--eager`** - Create build immediately (default: lazy)
```bash
vizzly run "npm test" --eager
```

**`--threshold <number>`** - Comparison threshold (0-1, default: 0.01)
```bash
vizzly run "npm test" --threshold 0.02
```

### Development Options

**`--tdd`** - Enable TDD mode (see [TDD Mode Guide](./tdd-mode.md))
```bash
vizzly run "npm test" --tdd
```

**`--allow-no-token`** - Allow running without API token
```bash
vizzly run "npm test" --allow-no-token
```

**`--token <token>`** - API token override
```bash
vizzly run "npm test" --token "your-token-here"
```

### Baseline Configuration

**`--baseline-build <id>`** - Use specific build as baseline
```bash
vizzly run "npm test" --baseline-build "build_123"
```

**`--baseline-comparison <id>`** - Use specific comparison as baseline
```bash
vizzly run "npm test" --baseline-comparison "comp_456"
```

## Screenshot Properties

The `properties` object in `vizzlyScreenshot()` is flexible and can contain any metadata:

```javascript
await vizzlyScreenshot('dashboard', screenshot, {
  properties: {
    // Technical metadata
    browser: 'chrome',
    os: 'macos',
    viewport: '1920x1080',
    device: 'desktop',
    
    // Organizational metadata
    component: 'dashboard',
    page: 'home',
    feature: 'analytics',
    theme: 'dark',
    
    // Test metadata
    testSuite: 'smoke-tests',
    userType: 'admin',
    state: 'logged-in',
    
    // Custom metadata
    buildNumber: process.env.BUILD_NUMBER,
    environment: 'staging'
  }
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Visual Tests
on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx vizzly run "npm test" --wait
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

## Advanced Usage

### Conditional Screenshots

Only take screenshots when Vizzly is enabled:

```javascript
import { isVizzlyEnabled, vizzlyScreenshot } from '@vizzly-testing/cli/client';

if (isVizzlyEnabled()) {
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot);
}
```

### Batch Screenshot Processing

Wait for all screenshots to be processed:

```javascript
import { vizzlyFlush } from '@vizzly-testing/cli/client';

// Take multiple screenshots
await vizzlyScreenshot('page1', screenshot1);
await vizzlyScreenshot('page2', screenshot2);
await vizzlyScreenshot('page3', screenshot3);

// Wait for all to be processed
await vizzlyFlush();
```

### Custom Configuration

Use a custom configuration per test run:

```javascript
import { configure } from '@vizzly-testing/cli/client';

// Configure before taking screenshots
configure({
  serverUrl: 'http://localhost:3001',
  enabled: true
});
```

## Troubleshooting

**Port already in use**
```bash
vizzly run "npm test" --port 3002
```

**Screenshots not captured**
- Verify you're calling `vizzlyScreenshot()` in your tests
- Check that your test framework supports the Buffer API
- Ensure the image data is valid PNG format

**Test command not found**
- Use absolute paths or ensure commands are in PATH
- Quote complex commands properly
- Test your command works independently first

**Server timeout**
- Increase timeout for long-running test suites
- Check for hanging processes or infinite loops

```bash
vizzly run "npm test" --timeout 120000  # 2 minutes
```

## Best Practices

### Screenshot Naming
Use descriptive, consistent names:
```javascript
// Good
await vizzlyScreenshot('homepage-logged-out', screenshot);
await vizzlyScreenshot('dashboard-admin-view', screenshot);

// Avoid
await vizzlyScreenshot('test1', screenshot);
await vizzlyScreenshot('screenshot', screenshot);
```

### Organizing Tests
Group related screenshots with properties:
```javascript
await vizzlyScreenshot('user-profile', screenshot, {
  properties: {
    component: 'profile',
    state: 'editing',
    userType: 'admin'
  }
});
```

### Performance
- Take screenshots only when necessary
- Use appropriate image sizes
- Consider screenshot timing in your tests

## Next Steps

- Learn about [TDD Mode](./tdd-mode.md) for local development
- Explore [Upload Command](./upload-command.md) for direct uploads
- Check the [API Reference](./api-reference.md) for detailed function documentation
