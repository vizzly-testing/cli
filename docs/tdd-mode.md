# TDD Mode Guide

TDD (Test-Driven Development) Mode enables fast local development with an interactive dashboard for real-time visual comparison feedback.

## What is TDD Mode?

TDD Mode transforms your visual testing workflow with:

- **Interactive Dashboard** - Real-time visual feedback as tests run
- **Local Comparison** - Compares screenshots on your machine using `odiff`
- **Live Updates** - See comparisons instantly in the browser
- **Baseline Management** - Accept/reject changes directly from the UI
- **Fast Feedback** - No network uploads during development
- **No Token Required** - Works entirely offline for local development

## Quick Start

### 1. Start the TDD Dashboard

Start the interactive dashboard server:

```bash
npx vizzly tdd start
```

🐻 **Dashboard starts:**
- Opens at `http://localhost:47392` (or custom `--port`)
- Shows empty state ready for comparisons
- Runs in foreground (use `--daemon` for background)

### 2. Run Your Tests in Watch Mode

In a separate terminal, run your tests in watch mode:

```bash
npm test -- --watch
```

🐻 **As tests run:**
- Screenshots sent to dashboard in real-time
- Comparisons appear instantly
- Live pass/fail statistics update
- Filter by status (all/changed/identical/new)

### 3. Review Changes in the Dashboard

Open your browser to `http://localhost:47392`:

- **Visual Diff Modes** - Overlay, side-by-side, onion skin, toggle
- **Accept Baselines** - Click to accept individual or all changes
- **Test Statistics** - Total tests, pass rate, change detection
- **Dark Theme** - Easy on the eyes during development

### 4. Accept Changes (Update Baseline)

Accept changes directly in the dashboard UI, or via CLI:

```bash
npx vizzly tdd run "npm test" --set-baseline
```

🐻 **Baseline update behavior:**
- Skips all comparisons
- Sets current screenshots as new baselines
- All tests pass (baseline accepted)
- Future runs use updated baselines

### 5. Stop the Dashboard

When done developing:

```bash
npx vizzly tdd stop
```

Or press `Ctrl+C` if running in foreground.

## How It Works

TDD Mode provides two workflows:

### Interactive Dashboard Workflow

1. **Start dashboard** - `vizzly tdd start` launches persistent server
2. **Run tests in watch** - Tests run continuously as you code
3. **Live updates** - Screenshots compared and displayed in real-time
4. **Review in browser** - Visual diff modes help analyze changes
5. **Accept baselines** - Click to update baselines from UI

### Single-Shot Workflow

1. **Run tests** - `vizzly tdd run "npm test"` executes once
2. **Compares locally** - Uses `odiff` for pixel-perfect comparison
3. **Generates report** - Creates HTML report with visual comparisons
4. **Exit with status** - Fails if differences exceed threshold

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
├── report/              # Interactive HTML report
│   └── index.html       # Visual comparison interface
└── diffs/               # Visual diff images (when differences found)
    ├── homepage.png     # Red overlay showing differences
    └── dashboard.png
```

**Important**: Add `.vizzly/` to your `.gitignore` file as it contains local development artifacts.

## Interactive Dashboard

The TDD dashboard provides real-time visual comparison feedback as you develop.

### 🐻 **Dashboard Features**

**Live Updates**
- Screenshots appear as tests run
- Comparisons processed in real-time
- No page refresh needed

**Visual Diff Modes**
- **Overlay** - Toggle diff overlay on/off
- **Side-by-Side** - Compare baseline and current horizontally
- **Onion Skin** - Drag to reveal baseline underneath
- **Toggle** - Click to switch between baseline and current

**Baseline Management**
- Accept individual screenshots as baseline
- Accept all changes at once
- Reset baselines to previous state

**Statistics Dashboard**
- Total tests run
- Pass/fail counts
- Visual change detection rate
- Filter by test status

### 🐻 **Dashboard UI**

```bash
# Start the dashboard
npx vizzly tdd start

# Opens at http://localhost:47392
# Shows real-time comparisons as tests run
# Dark theme optimized for development
```

### 🐻 **Static HTML Report**

When using `vizzly tdd run`, a static HTML report is generated at `.vizzly/report/index.html`:

```bash
# Report path shown after each run
🐻 View detailed report: file:///path/to/.vizzly/report/index.html

# Click the link in your terminal, or open manually
open .vizzly/report/index.html  # macOS
```

## Command Options

### TDD Subcommands

**Start Dashboard Server**
```bash
vizzly tdd start [options]
```

Options:
- `--port <port>` - Server port (default: 47392)
- `--threshold <number>` - Comparison threshold (default: 0.1)
- `--baseline-build <id>` - Use specific build as baseline
- `--daemon` - Run in background mode

**Run Tests (Single-Shot)**
```bash
vizzly tdd run "npm test" [options]
```

Options:
- `--set-baseline` - Accept screenshots as new baseline
- `--port <port>` - Server port (default: 47392)
- `--threshold <number>` - Comparison threshold (default: 0.1)
- `--baseline-build <id>` - Use specific build as baseline
- `--timeout <ms>` - Server timeout (default: 30000)

**Stop Dashboard Server**
```bash
vizzly tdd stop
```

### Legacy Command

The legacy command format is still supported:

```bash
vizzly tdd "npm test"  # Equivalent to: vizzly tdd run "npm test"
```

## Development Workflow

### Interactive Development (Recommended)

```bash
# Terminal 1: Start dashboard
npx vizzly tdd start

# Terminal 2: Run tests in watch mode
npm test -- --watch

# Browser: Open http://localhost:47392
# See live comparisons as you code

# Accept changes from dashboard UI when ready
# Or stop when done: npx vizzly tdd stop
```

### Single-Shot Testing

```bash
# Run tests once with comparison
npx vizzly tdd run "npm test"

# Accept changes as new baseline
npx vizzly tdd run "npm test" --set-baseline

# Upload to Vizzly when satisfied
npx vizzly run "npm test" --wait
```

### Feature Development

```bash
# Start interactive dashboard
npx vizzly tdd start

# In another terminal, run tests in watch mode
npm test -- --watch

# Make changes and see live feedback in browser
# Accept baselines directly from dashboard UI

# When feature complete, upload to Vizzly
npx vizzly run "npm test" --build-name "Feature: New Dashboard"
```

### Bug Fixing

```bash
# Quick verification with single-shot mode
npx vizzly tdd run "npm test"

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
    threshold: 0.01        // 1% difference tolerance
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
