# TDD Mode Guide

TDD (Test-Driven Development) Mode enables fast local development by comparing screenshots locally without uploading to Vizzly. Perfect for rapid iteration and debugging visual changes.

## What is TDD Mode?

TDD Mode transforms your visual testing workflow by:

- **Local comparison** - Compares screenshots on your machine using `odiff`
- **Fast feedback** - No network uploads during development
- **Immediate results** - Tests fail instantly when visual differences are detected
- **Cached baselines** - Downloads and stores baseline images locally

## Quick Start

### 1. Initial Setup

First, create baselines by running a successful build:

```bash
npx vizzly run "npm test" --wait
```

This uploads screenshots to Vizzly and establishes your baseline.

### 2. Switch to TDD Mode

Use the `--tdd` flag for local development:

```bash
npx vizzly run "npm test" --tdd
```

On first run, this will:
- Download baseline screenshots from your latest passed build
- Store them in `.vizzly/baselines/`
- Compare new screenshots locally

### 3. Iterate Quickly

Make code changes and test locally:

```bash
# Make changes to your UI
vim src/components/Header.js

# Test immediately with local comparison
npx vizzly run "npm test" --tdd
```

### 4. Upload When Ready

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
├── baselines/           # Downloaded baseline images
│   ├── homepage.png
│   ├── dashboard.png
│   └── metadata.json    # Baseline build information
├── current/             # Current test screenshots  
│   ├── homepage.png
│   └── dashboard.png
└── comparisons/         # Visual comparison images
    ├── homepage.png     # Only created if differences found
    └── dashboard.png
```

**Important**: Add `.vizzly/` to your `.gitignore` file as it contains local development artifacts.

## Command Options

### Basic TDD Mode

```bash
vizzly run "npm test" --tdd
```

### Custom Baseline Source

**`--baseline-build <id>`** - Use specific build as baseline
```bash
vizzly run "npm test" --tdd --baseline-build build-abc123
```

**`--baseline-comparison <id>`** - Use specific comparison as baseline  
```bash
vizzly run "npm test" --tdd --baseline-comparison comparison-xyz789
```

### Server Configuration

TDD Mode still runs a local server for screenshot capture:

```bash
vizzly run "npm test" --tdd --port 3002
vizzly run "npm test" --tdd --timeout 60000
```

## Development Workflow

### Initial Development

```bash
# 1. Create initial baselines
npx vizzly run "npm test" --wait

# 2. Start TDD development
npx vizzly run "npm test" --tdd

# 3. Make changes and iterate
# Edit code...
npx vizzly run "npm test" --tdd

# 4. Upload when satisfied
npx vizzly run "npm test" --wait
```

### Feature Development

```bash
# Start with latest baselines
npx vizzly run "npm test" --tdd

# Develop new feature with immediate feedback
while [ $? -ne 0 ]; do
  # Edit code to fix visual differences
  vim src/components/NewFeature.js
  npx vizzly run "npm test" --tdd
done

# Upload completed feature
npx vizzly run "npm test" --build-name "Feature: New Dashboard"
```

### Bug Fixing

```bash
# Use TDD mode to verify fixes
npx vizzly run "npm test" --tdd

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
npx vizzly run "npm test" --tdd --baseline-build build-xyz789
```

### Force Baseline Refresh

Delete local baselines to force re-download:

```bash
rm -rf .vizzly/baselines/
npx vizzly run "npm test" --tdd
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
        run: npx vizzly run "npm test" --tdd
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
npx vizzly run "npm test" --tdd
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