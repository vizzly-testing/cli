---
name: Debug Visual Regression
description: Analyze visual regression test failures in Vizzly. Use when the user mentions failing visual tests, screenshot differences, visual bugs, diffs, or asks to debug/investigate/analyze visual changes. Works with both local TDD and cloud modes.
allowed-tools: Read, WebFetch, mcp__plugin_vizzly_vizzly__read_comparison_details, mcp__plugin_vizzly_vizzly__accept_baseline, mcp__plugin_vizzly_vizzly__approve_comparison, mcp__plugin_vizzly_vizzly__reject_comparison
---

# Debug Visual Regression

Automatically analyze visual regression failures when the user mentions them. This Skill helps identify the root cause of visual differences and suggests whether to accept or fix changes.

## When to Use This Skill

Activate this Skill when the user:
- Mentions "failing visual test" or "screenshot failure"
- Asks "what's wrong with my visual tests?"
- Says "the homepage screenshot is different" or similar
- Wants to understand why a visual comparison failed
- Asks to "debug", "analyze", or "investigate" visual changes
- Mentions specific screenshot names that are failing

## How This Skill Works

1. **Automatically detect the mode** (local TDD or cloud)
2. **Fetch comparison details** using the screenshot name or comparison ID
3. **View the actual images** to perform visual analysis
4. **Provide detailed insights** on what changed and why
5. **Suggest next steps** (accept, reject, or fix)

## Instructions

### Step 1: Call the Unified MCP Tool

Use `read_comparison_details` with the identifier:
- Pass screenshot name (e.g., "homepage_desktop") for local mode
- Pass comparison ID (e.g., "cmp_abc123") for cloud mode
- The tool automatically detects which mode to use
- Returns a response with `mode` field indicating local or cloud

### Step 2: Check the Mode in Response

The response will contain a `mode` field:
- **Local mode** (`mode: "local"`): Returns filesystem paths (`baselinePath`, `currentPath`, `diffPath`)
- **Cloud mode** (`mode: "cloud"`): Returns URLs (`baselineUrl`, `currentUrl`, `diffUrl`)

### Step 3: Analyze Comparison Data

Examine the comparison details:
- Diff percentage and threshold
- Status (failed/new/passed)
- Image references (paths or URLs depending on mode)
- Viewport and browser information

### Step 4: View the Actual Images

**CRITICAL:** You MUST view the baseline and current images to provide accurate analysis.

**If mode is "local":**
- Response contains filesystem paths (`baselinePath`, `currentPath`, `diffPath`)
- **Use the Read tool to view ONLY baselinePath and currentPath**
- **DO NOT read diffPath** - it causes API errors

**If mode is "cloud":**
- Response contains public URLs (`baselineUrl`, `currentUrl`, `diffUrl`)
- **Use the WebFetch tool to view ONLY baselineUrl and currentUrl**
- **DO NOT fetch diffUrl** - it causes API errors

### Step 5: Provide Detailed Visual Insights

Based on what you observe in the images:

**Describe the specific visual differences:**
- Which UI components, elements, or layouts changed
- Colors, spacing, typography, positioning changes
- Missing or added elements

**Categorize the change by diff percentage:**
- **< 1%:** Anti-aliasing, font rendering, subpixel differences
- **1-5%:** Layout shifts, padding/margin changes, color variations
- **> 5%:** Significant layout changes, missing content, major visual updates

**Identify possible causes:**
- CSS changes (margin, padding, positioning)
- Content changes (text, images)
- State issues (hover, focus, loading states)
- Browser/viewport rendering differences

### Step 6: Suggest Next Steps

**If local mode:**
- Whether to accept using `accept_baseline` tool
- Specific code areas to investigate if unintentional
- How to fix common issues

**If cloud mode:**
- Whether to approve using `approve_comparison` tool
- Whether to reject using `reject_comparison` tool with reason
- Team coordination steps

**If changes are intentional:**
- Explain why it's safe to accept/approve
- Confirm this matches expected behavior

**If changes are unintentional:**
- Specific files to check (CSS, templates, components)
- Git commands to investigate recent changes
- How to reproduce and fix

## Example Analysis (Local TDD Mode)

```
User: "The homepage screenshot is failing"

Step 1: Call tool
Tool: read_comparison_details({ identifier: "homepage" })

Response:
{
  "name": "homepage",
  "status": "failed",
  "diffPercentage": 2.3,
  "threshold": 0.1,
  "mode": "local",
  "baselinePath": "/Users/you/project/.vizzly/baselines/homepage.png",
  "currentPath": "/Users/you/project/.vizzly/screenshots/homepage.png"
}

Step 2: View images
Read(baselinePath)
Read(currentPath)

Step 3: Visual Analysis
Comparing the two images, I can see the following changes:

Visual Differences:
- The navigation header has shifted down by approximately 10-15 pixels
- Logo position moved from y:20px to y:35px
- Navigation menu items are now overlapping with the hero section
- The "Sign Up" button background changed from blue (#2563eb) to darker blue (#1e40af)

Root Cause Analysis:
Based on the 2.3% diff and visual comparison, this appears to be:
1. A margin or padding change on the header element
2. The button color change suggests a hover state being captured

Recommendations:
If intentional:
- This appears to be a deliberate redesign of the header spacing
- Accept as new baseline if these changes match your design updates

If unintentional:
- Check recent CSS changes to `.header` or `nav` margin-top/padding-top
- Verify button states during screenshot capture to avoid hover state
- Investigate with: `git diff src/styles/header.css`
- Fix the header positioning and re-run tests
```

## Example Analysis (Cloud Mode)

```
User: "Can you check comparison cmp_xyz789?"

Step 1: Call tool
Tool: read_comparison_details({
  identifier: "cmp_xyz789",
  apiToken: "vzt_..."
})

Response:
{
  "name": "login-page",
  "status": "failed",
  "diffPercentage": 0.8,
  "threshold": 0.1,
  "mode": "cloud",
  "baselineUrl": "https://app.vizzly.dev/screenshots/abc123/baseline.png",
  "currentUrl": "https://app.vizzly.dev/screenshots/abc123/current.png",
  "comparisonId": "cmp_xyz789"
}

Step 2: View images
WebFetch(baselineUrl, "show me the baseline screenshot")
WebFetch(currentUrl, "show me the current screenshot")

Step 3: Visual Analysis
The differences are very subtle (0.8% diff):

Visual Differences:
- Input field border color slightly different (#e5e7eb vs #d1d5db)
- Submit button has very slight shadow change
- Font anti-aliasing appears slightly different

Root Cause Analysis:
This appears to be browser rendering differences or minor CSS updates:
- The 0.8% diff suggests this is not a major visual change
- Could be Chrome version differences
- Could be sub-pixel rendering variations

Recommendations:
This is likely acceptable to approve:
- The changes are extremely minor (< 1%)
- No functional UI changes
- Probably browser/rendering variations

Approve with: approve_comparison tool
Or adjust threshold to 1% if these variations are expected
```

## Important Notes

- **Always use `read_comparison_details`** - it automatically detects the mode
- **Check the `mode` field** to know which viewing tool to use (Read vs WebFetch)
- **Never view diff images** - only baseline and current
- **Visual inspection is critical** - don't rely solely on diff percentages
- **Be specific in analysis** - identify exact elements that changed
- **Provide actionable advice** - specific files, commands, or tools to use
- **Consider context** - small diffs might be acceptable, large ones need investigation
