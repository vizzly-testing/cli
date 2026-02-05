---
name: vizzly-knowledge
description: Core knowledge about Vizzly visual testing - file structure, CLI commands, and how it works. Use when working with Vizzly, running visual tests, or helping with screenshot-related tasks.
user-invocable: false
---

# Vizzly Visual Testing Knowledge Base

You have deep knowledge of Vizzly, a visual regression testing platform. This context helps you work effectively with Vizzly projects.

## What is Vizzly?

Vizzly captures screenshots from real functional tests (not isolated component renders) and compares them against baselines. It works in two modes:

**TDD Mode (Local Development):**
- Run `vizzly tdd start` to start the local server
- Screenshots are compared locally using `honeydiff` (fast Rust-based diffing)
- Interactive dashboard at `http://localhost:47392`
- Baselines stored in `.vizzly/baselines/`
- No API token required

**Cloud Mode (CI/CD):**
- Run `vizzly run "npm test" --wait`
- Screenshots uploaded to Vizzly cloud
- Team reviews changes via web dashboard
- Requires `VIZZLY_TOKEN`

## The .vizzly Directory

When Vizzly runs, it creates a `.vizzly/` directory with this structure:

```
.vizzly/
├── baselines/          # Baseline screenshots (PNG files)
│   ├── homepage.png
│   └── login-form.png
├── current/            # Current test screenshots
│   ├── homepage.png
│   └── login-form.png
├── diffs/              # Visual diff images (red highlights)
│   └── homepage.png
├── report-data.json    # Comparison results (JSON)
├── server.json         # TDD server info (port, etc.)
└── baseline-metadata.json  # Source of baselines (optional)
```

## Understanding report-data.json

This is the primary source of truth for test results. Read it to understand test status:

```json
{
  "comparisons": [
    {
      "name": "homepage",
      "status": "failed",        // "passed", "failed", or "new"
      "diffPercentage": 2.3,     // Percentage of pixels different
      "threshold": 0.1,          // Allowed diff percentage
      "current": "/images/current/homepage.png",
      "baseline": "/images/baselines/homepage.png",
      "diff": "/images/diffs/homepage.png"
    }
  ]
}
```

**Status meanings:**
- `passed` - Screenshot matches baseline within threshold
- `failed` - Screenshot differs more than threshold allows
- `new` - No baseline exists yet (first time this screenshot was captured)

## CLI Commands

**TDD Mode (Local Development):**
```bash
vizzly tdd start              # Start TDD server (background)
vizzly tdd run "npm test"     # Run tests with ephemeral server
vizzly tdd status             # Show current test status
vizzly tdd stop               # Stop the TDD server
vizzly baselines              # List and query local baselines
```

**Cloud Mode (CI/CD):**
```bash
vizzly run "npm test"         # Run tests and upload to cloud
vizzly run "npm test" --wait  # Wait for cloud processing
vizzly status <build-id>      # Check build status
vizzly builds                 # List and query builds
vizzly finalize <parallel-id> # Finalize parallel builds
vizzly comparisons            # Query and search comparisons
```

**Review Commands (approve/reject visual changes):**
```bash
vizzly comparisons -b <build-id>                     # List comparisons for a build
vizzly comparisons --name "Button*" --status changed # Search by name/status
vizzly approve <comparison-id>                       # Approve a comparison
vizzly approve <comparison-id> -m "LGTM"             # Approve with comment
vizzly reject <comparison-id> -r "reason"            # Reject (reason required)
vizzly comment <build-id> "message"                  # Add comment to a build
```

**Project Setup:**
```bash
vizzly init                   # Create vizzly.config.js
vizzly config                 # Display current configuration
vizzly doctor                 # Run diagnostics to check environment
```

**Account & Authentication:**
```bash
vizzly login                  # Authenticate with Vizzly cloud
vizzly logout                 # Clear stored authentication tokens
vizzly whoami                 # Show current auth status
vizzly orgs                   # List organizations you have access to
vizzly projects               # List projects you have access to
```

**Project Configuration:**
```bash
vizzly project:select         # Configure project for current directory
vizzly project:list           # Show all configured projects
vizzly project:token          # Show project token for current directory
vizzly project:remove         # Remove project configuration
```

**Advanced:**
```bash
vizzly api <method> <endpoint>  # Make raw API requests
vizzly upload                   # Upload screenshots directly
vizzly preview                  # Upload static files as preview
```

## Taking Screenshots in Tests

The client SDK provides `vizzlyScreenshot()`:

```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

// In your test
await vizzlyScreenshot('homepage', await page.screenshot(), {
  browser: 'chrome',
  viewport: '1920x1080'
});
```

**Screenshot Identity:** Screenshots are matched by signature: `name|viewport_width|browser`. The same logical screenshot across runs can be compared even with different parameters.

## Accepting Baselines

When a screenshot changes intentionally, you need to accept it as the new baseline:

**Via TDD Dashboard (Local):**
1. Open `http://localhost:47392`
2. Review the visual diff
3. Click "Accept" on screenshots you want to update

**Via CLI (Cloud builds):**
```bash
vizzly comparisons -b <build-id>          # List comparisons for a build
vizzly approve <comparison-id>            # Approve a comparison
vizzly reject <comparison-id> -r "reason" # Reject (reason required)
```

**Via File Operations (Local TDD):**
Copy the current screenshot to baselines:
```bash
cp .vizzly/current/homepage.png .vizzly/baselines/homepage.png
```

## Configuration

Vizzly uses `vizzly.config.js` for configuration:

```javascript
import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig({
  threshold: 0.1,           // Default diff threshold (0.1 = 0.1%)
  port: 47392,              // TDD server port
  basePath: '.vizzly',      // Where to store screenshots
});
```

## Environment Variables

- `VIZZLY_TOKEN` - API authentication token
- `VIZZLY_API_URL` - API base URL (default: https://app.vizzly.dev)
- `VIZZLY_ENABLED` - Enable/disable SDK (default: auto-detect)
- `VIZZLY_LOG_LEVEL` - Logging level (debug|info|warn|error)

## Common Workflows

**Starting visual testing on a project:**
1. Install: `npm install --save-dev @vizzly-testing/cli`
2. Init: `npx vizzly init`
3. Add screenshots to tests
4. Run: `vizzly tdd run "npm test"`
5. Review and accept baselines

**Debugging a failing screenshot:**
1. Read `.vizzly/report-data.json` to find the failing comparison
2. View the baseline and current images
3. Compare visually to identify what changed
4. Decide: accept as new baseline OR fix the visual regression
