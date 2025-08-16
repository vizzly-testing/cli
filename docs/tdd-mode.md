# TDD Mode Guide

TDD (Test-Driven Development) Mode enables fast local development by comparing screenshots locally without uploading to Vizzly. Perfect for rapid iteration and debugging visual changes.

## What is TDD Mode?

TDD Mode transforms your visual testing workflow by:

- **Local comparison** - Compares screenshots on your machine using `odiff`
- **Fast feedback** - No network uploads during development
- **Immediate results** - Tests fail instantly when visual differences are detected  
- **Auto-baseline creation** - Creates baselines locally when none exist
- **No token required** - Works entirely offline for local development

## Quick Start

### 1. First Run (Creates Baseline)

Start TDD mode with any test - no setup required:

```bash
npx vizzly tdd "npm test"
```

🐻 **First run behavior:**
- Auto-detects missing API token (no `--allow-no-token` needed)
- Creates baseline from first screenshots
- Stores them in `.vizzly/baselines/`
- All tests pass (baseline creation)

### 2. Subsequent Runs (Compare Against Baseline)

Make changes and test again:

```bash
# Make changes to your UI
vim src/components/Header.js

# Test immediately with local comparison
npx vizzly tdd "npm test"
```

🐻 **Comparison behavior:**
- Compares new screenshots against local baselines
- **Tests fail immediately** when visual differences detected
- Shows exact diff paths and percentages
- Creates diff images in `.vizzly/diffs/`

### 3. Accept Changes (Update Baseline)

When you're happy with changes, accept them as new baselines:

```bash
npx vizzly tdd "npm test" --set-baseline
```

🐻 **Baseline update behavior:**
- Skips all comparisons
- Sets current screenshots as new baselines  
- All tests pass (baseline accepted)
- Future runs use updated baselines

### 4. Upload When Ready (Optional)

When you're satisfied with changes, upload to Vizzly:

```bash
npx vizzly run "npm test" --wait
```

## How It Works

TDD Mode creates a local development environment:

1. **Downloads baselines** - Gets approved screenshots from Vizzly
2. **Runs tests** - Executes your test suite normally  
3. **Captures screenshots** - Collects new screenshots via `vizzlyScreenshot()`
4. **Compares locally** - Uses `odiff` for pixel-perfect comparison
5. **Fails immediately** - Tests fail when differences exceed threshold
6. **Saves comparisons** - Stores diff images for inspection

## Directory Structure

TDD Mode creates a `.vizzly/` directory:

```
.vizzly/
├── baselines/           # Baseline images (local or downloaded)
│   ├── homepage.png
│   ├── dashboard.png
│   └── metadata.json    # Baseline build information
├── current/             # Current test screenshots  
│   ├── homepage.png
│   └── dashboard.png
└── diffs/               # Visual diff images (when differences found)
    ├── homepage.png     # Red overlay showing differences
    └── dashboard.png
```

**Important**: Add `.vizzly/` to your `.gitignore` file as it contains local development artifacts.

## Command Options

### Basic TDD Mode

```bash
vizzly tdd "npm test"
```

### Accept Changes (Update Baseline)

```bash
vizzly tdd "npm test" --set-baseline
```

🐻 Use this when you want to accept current screenshots as the new baseline.

### Custom Baseline Source (With API Token)

**`--baseline-build <id>`** - Use specific build as baseline
```bash
VIZZLY_TOKEN=your-token vizzly tdd "npm test" --baseline-build build-abc123
```

**`--baseline-comparison <id>`** - Use specific comparison as baseline  
```bash
VIZZLY_TOKEN=your-token vizzly tdd "npm test" --baseline-comparison comparison-xyz789
```

### Server Configuration

TDD Mode runs a local server for screenshot capture:

```bash
vizzly tdd "npm test" --port 3002
vizzly tdd "npm test" --timeout 60000
```

## Development Workflow

### Initial Development

```bash
# 1. Create initial baselines
npx vizzly run "npm test" --wait

# 2. Start TDD development
npx vizzly tdd "npm test"

# 3. Make changes and iterate
# Edit code...
npx vizzly tdd "npm test"

# 4. Upload when satisfied
npx vizzly run "npm test" --wait
```

### Feature Development

```bash
# Start with latest baselines
npx vizzly tdd "npm test"

# Develop new feature with immediate feedback
while [ $? -ne 0 ]; do
  # Edit code to fix visual differences
  vim src/components/NewFeature.js
  npx vizzly tdd "npm test"
done

# Upload completed feature
npx vizzly run "npm test" --build-name "Feature: New Dashboard"
```

### Bug Fixing

```bash
# Use TDD mode to verify fixes
npx vizzly tdd "npm test"

# Tests should pass when bug is fixed
# Then upload the fix
npx vizzly run "npm test" --build-name "Fix: Header alignment issue"
```

## Comparison Settings

TDD Mode uses the same comparison settings as production:

- **Threshold matching** - Uses your configured threshold
- **Anti-aliasing detection** - Handles font rendering differences
- **Color tolerance** - Accounts for minor color variations

Configure in `vizzly.config.js`:

```javascript
export default {
  comparison: {
    threshold: 0.01,        // 1% difference tolerance
    ignoreAntialiasing: true,
    ignoreColors: false
  }
};
```

## Managing Baselines

### Check Current Baseline Status

```bash
npx vizzly status  # Shows latest build info
```

### Update Baselines

Download new baselines from a different build:

```bash
npx vizzly tdd "npm test" --baseline-build build-xyz789
```

### Force Baseline Refresh

Delete local baselines to force re-download:

```bash
rm -rf .vizzly/baselines/
npx vizzly tdd "npm test"
```

## Advanced Usage

### Conditional TDD Mode

Check if TDD mode is active in your tests:

```javascript
import { getVizzlyInfo } from '@vizzly-testing/cli/client';

const info = getVizzlyInfo();
if (info.tddMode) {
  console.log('Running in TDD mode - fast local comparison');
} else {
  console.log('Running in upload mode - results going to Vizzly');
}
```

### Custom Comparison Logic

TDD mode respects your screenshot properties:

```javascript
await vizzlyScreenshot('homepage', screenshot, {
  threshold: 0.05,  // More tolerant for this specific screenshot
  browser: 'chrome',
  viewport: '1920x1080'
});
```

## CI/CD Integration

Use TDD mode for faster PR builds:

```yaml
name: Visual Tests
on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      
      # Use TDD mode for PR builds (faster, no uploads)
      - name: TDD Visual Tests (PR)
        if: github.event_name == 'pull_request'
        run: npx vizzly tdd "npm test"
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
      
      # Upload full build for main branch
      - name: Full Visual Tests (main)
        if: github.ref == 'refs/heads/main'
        run: npx vizzly run "npm test" --wait
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Benefits

### Speed
- **No network uploads** - Everything happens locally
- **Immediate feedback** - See results in seconds
- **No API rate limits** - Test as often as needed

### Development Experience  
- **Fast iteration** - Make changes and test immediately
- **Visual debugging** - See exact pixel differences
- **Offline capable** - Works without internet (after initial baseline download)

### Cost Efficiency
- **Reduced API usage** - Only upload final results
- **Faster CI builds** - Use TDD mode for PR validation
- **Local development** - No cloud resources consumed

## Troubleshooting

### No Baseline Found
```
Error: No baseline found for screenshot 'homepage'
```

**Solution**: Run a successful build first to create baselines:
```bash
npx vizzly run "npm test" --wait
```

### Visual Difference Detected
```
Error: Visual difference detected in 'homepage' (threshold: 1.5%)
```

This is expected behavior! Check the comparison image:
```bash
open .vizzly/comparisons/homepage.png
```

Fix the visual issue or update your baseline if the change is intentional.

### Comparison Failed
```
Error: Failed to compare 'homepage': baseline image not found
```

**Solution**: Refresh baselines:
```bash
rm -rf .vizzly/baselines/
npx vizzly tdd "npm test"
```

### Odiff Not Found
```
Error: odiff binary not found
```

**Solution**: The `odiff-bin` package should be installed automatically. Try:
```bash
npm install odiff-bin
```

## Best Practices

### Use TDD Mode For
- **Local development** - Fast iteration on UI changes
- **Bug fixing** - Verify visual fixes immediately  
- **PR validation** - Quick checks without uploading
- **Debugging** - Understand exactly what changed visually

### Use Upload Mode For
- **Final results** - When changes are ready for review
- **Baseline creation** - Initial setup and approved changes
- **Production releases** - Official visual regression testing
- **Team collaboration** - Sharing results with designers/stakeholders

### Directory Management
- **Add to .gitignore** - Never commit `.vizzly/` directory
- **Regular cleanup** - Delete old comparison images periodically
- **Baseline updates** - Refresh baselines when UI intentionally changes

## Next Steps

- Learn about [Test Integration](./test-integration.md) for screenshot capture
- Explore [Upload Command](./upload-command.md) for direct uploads  
- Check the [API Reference](./api-reference.md) for programmatic usage