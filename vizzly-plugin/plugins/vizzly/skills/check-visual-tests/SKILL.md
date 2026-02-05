---
name: check-visual-tests
description: Check the status of Vizzly visual regression tests. Use when the user asks about test status, test results, what's failing, how tests are doing, or wants a summary of visual tests.
---

# Check Visual Test Status

When the user asks about their visual test status, read the test results and provide a clear summary.

## Step 1: Read the Test Results

Use the Read tool to get `.vizzly/report-data.json`:

```
Read .vizzly/report-data.json
```

**If the file is too large** (over 256KB), use Bash to parse it:
```bash
cat .vizzly/report-data.json | node -e "
  const data = require('fs').readFileSync('/dev/stdin', 'utf8');
  const json = JSON.parse(data);
  const comps = json.comparisons || [];
  console.log(JSON.stringify({
    total: comps.length,
    passed: comps.filter(c => c.status === 'passed').length,
    failed: comps.filter(c => c.status === 'failed').length,
    new: comps.filter(c => c.status === 'new').length,
    failures: comps.filter(c => c.status === 'failed').slice(0, 10)
  }, null, 2));
"
```

**If the file doesn't exist**, check for `.vizzly/server.json` to see if the TDD server was running.

**If the JSON is malformed**, suggest running `vizzly tdd status` as a fallback.

## Step 2: Summarize the Results

Count the comparisons by status and present a clear summary:

```
Vizzly Visual Test Status:

Total: 15 screenshots
  ✅ Passed: 12
  ❌ Failed: 2 (exceeded threshold)
  🆕 New: 1 (no baseline)
```

## Step 3: List Issues

**If there are failures:**
List each failing screenshot with its diff percentage and threshold:

```
Failed Comparisons:
• homepage (2.3% diff, threshold: 0.1%)
• login-form (1.8% diff, threshold: 0.1%)
```

**If there are new screenshots:**
Explain they need baseline approval:

```
New Screenshots:
• dashboard-widget (no baseline yet)

New screenshots need to be reviewed and accepted as baselines.
```

## Step 4: Provide Dashboard Link

If the TDD server is running, read `.vizzly/server.json` to get the port:

```json
// .vizzly/server.json contains:
{ "port": 47392, "pid": 12345 }
```

Then provide the dashboard URL using the actual port:

```
Dashboard: http://localhost:{port}

Open the dashboard to:
- View visual diffs side-by-side
- Accept or reject baseline changes
- Review all screenshots at a glance
```

**Default port is 47392** if server.json doesn't specify.

## Step 5: Suggest Next Steps

**If all passed:**
```
All visual tests are passing. No action needed.
```

**If there are failures:**
```
Next steps:
1. Review the failed comparisons in the dashboard
2. If changes are intentional, accept them as new baselines
3. If changes are bugs, investigate and fix the visual regression
4. Ask me to "debug the homepage screenshot" for detailed analysis
```

**If there are new screenshots:**
```
Next steps:
1. Review new screenshots in the dashboard
2. If they look correct, accept them as baselines
3. Run tests again to confirm they pass
```

## When TDD Server Isn't Running

If `.vizzly/` directory or `report-data.json` doesn't exist:

```
Vizzly TDD Status: Not Running

The TDD server doesn't appear to be running. To start visual testing:

1. Start the TDD server:
   vizzly tdd start

2. Run your tests:
   npm test

3. Check status again or open the dashboard:
   http://localhost:47392
```

## Alternative: CLI Status Commands

You can also run CLI commands to get status:

**For local TDD:**
```bash
vizzly tdd status         # Show current test status
vizzly baselines          # List and query baselines
```

**For cloud builds:**
```bash
vizzly status <build-id>  # Check specific build status
vizzly builds             # List recent builds
vizzly comparisons        # Query and search comparisons
```

These commands show the same information in the terminal.

## Example Full Response

```
Vizzly Visual Test Status:

Total: 8 screenshots
  ✅ Passed: 5
  ❌ Failed: 2
  🆕 New: 1

Failed Comparisons:
• homepage (2.3% diff, threshold: 0.1%)
  The diff is larger than your 0.1% threshold
• checkout-cart (0.8% diff, threshold: 0.1%)
  Small difference but still above threshold

New Screenshots:
• user-profile (needs baseline)

Dashboard: http://localhost:47392

Next steps:
- Open the dashboard to review the visual diffs
- For the failures, decide if changes are intentional
- For the new screenshot, review and accept as baseline
- Ask me to debug specific failures for detailed analysis
```
