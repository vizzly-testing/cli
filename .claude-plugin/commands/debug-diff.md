---
description: Analyze a specific visual regression failure and suggest fixes
---

# Debug Vizzly Visual Regression

Analyze a specific failing visual comparison in detail. Supports both local TDD mode and cloud API mode.

## Process

1. **Call the unified MCP tool**: Use `read_comparison_details` with the identifier (screenshot name or comparison ID)
   - The tool automatically detects whether to use local TDD mode or cloud mode
   - Pass screenshot name (e.g., "homepage_desktop") for local mode
   - Pass comparison ID (e.g., "cmp_abc123") for cloud mode
   - Returns a response with `mode` field indicating which mode was used

2. **Check the mode in the response**:
   - **Local mode** (`mode: "local"`): Returns filesystem paths (`baselinePath`, `currentPath`, `diffPath`)
   - **Cloud mode** (`mode: "cloud"`): Returns URLs (`baselineUrl`, `currentUrl`, `diffUrl`)

3. **Analyze the comparison data**:
   - Diff percentage and threshold
   - Status (failed/new/passed)
   - Image references (paths or URLs depending on mode)

4. **View the actual images** (critical for visual analysis):

   Check the `mode` field in the response to determine which tool to use:

   **If mode is "local":**
   - Response contains filesystem paths (`baselinePath`, `currentPath`, `diffPath`)
   - **Use the Read tool to view ONLY baselinePath and currentPath**
   - **DO NOT read diffPath** - it causes API errors

   **If mode is "cloud":**
   - Response contains public URLs (`baselineUrl`, `currentUrl`, `diffUrl`)
   - **Use the WebFetch tool to view ONLY baselineUrl and currentUrl**
   - **DO NOT fetch diffUrl** - it causes API errors

   **IMPORTANT:** You MUST view the baseline and current images to provide accurate analysis

5. **Provide detailed visual insights** based on what you see:
   - What type of change was detected (small/moderate/large diff)
   - Describe the specific visual differences you observe in the images
   - Identify which UI components, elements, or layouts changed
   - Possible causes based on diff percentage and visual inspection:
     - <1%: Anti-aliasing, font rendering, subpixel differences
     - 1-5%: Layout shifts, padding/margin changes, color variations
     - > 5%: Significant layout changes, missing content, major visual updates

6. **Suggest next steps** based on the mode:
   - **If local mode**: Whether to accept using `accept_baseline` tool
   - **If cloud mode**: Whether to approve/reject using `approve_comparison` or `reject_comparison` tools
   - Areas to investigate if unintentional
   - How to fix common issues
   - Specific code changes if you can identify them from the visual diff

## Example Analysis (Local TDD Mode)

```
Step 1: Call read_comparison_details with screenshot name
Tool: read_comparison_details({ identifier: "homepage" })

Response:
{
  "name": "homepage",
  "status": "failed",
  "diffPercentage": 2.3,
  "threshold": 0.1,
  "mode": "local",
  "baselinePath": "/Users/you/project/.vizzly/baselines/homepage.png",
  "currentPath": "/Users/you/project/.vizzly/screenshots/homepage.png",
  "diffPath": "/Users/you/project/.vizzly/diffs/homepage.png"
}

Step 2: Detected mode is "local", so use Read tool for images
Read(baselinePath) and Read(currentPath)

Visual Analysis:
[After reading the baseline and current image files...]

Comparing the two images, the navigation header has shifted down by approximately 10-15 pixels.
Specific changes observed:
- The logo position moved from y:20px to y:35px
- Navigation menu items are now overlapping with the hero section
- The "Sign Up" button background changed from blue (#2563eb) to a darker blue (#1e40af)

Root Cause:
Based on the visual comparison, this appears to be a margin or padding change on the
header element. The button color change is likely a hover state being captured.

Recommendations:
1. Check for recent CSS changes to:
   - `.header` or `nav` margin-top/padding-top
   - Any global layout shifts affecting the header
2. The button color change suggests a hover state - ensure consistent state during screenshot capture
3. If the header position change is intentional:
   - Accept as new baseline using `accept_baseline` tool
4. If unintentional:
   - Revert CSS changes to header positioning
   - Verify with: `git diff src/styles/header.css`
```

## Example Analysis (Cloud Mode)

```
Step 1: Call read_comparison_details with comparison ID
Tool: read_comparison_details({
  identifier: "cmp_xyz789",
  apiToken: "vzt_..."
})

Response:
{
  "name": "homepage",
  "status": "failed",
  "diffPercentage": 2.3,
  "threshold": 0.1,
  "mode": "cloud",
  "baselineUrl": "https://app.vizzly.dev/screenshots/abc123/baseline.png",
  "currentUrl": "https://app.vizzly.dev/screenshots/abc123/current.png",
  "diffUrl": "https://app.vizzly.dev/screenshots/abc123/diff.png",
  "comparisonId": "cmp_xyz789",
  "buildId": "bld_abc123"
}

Step 2: Detected mode is "cloud", so use WebFetch tool for images
WebFetch(baselineUrl) and WebFetch(currentUrl)

Visual Analysis:
[After fetching the baseline and current image URLs...]

[Same analysis as local mode example...]

Recommendations:
1. [Same technical recommendations as local mode...]
2. If the header position change is intentional:
   - Approve this comparison using `approve_comparison` tool
3. If unintentional:
   - Reject using `reject_comparison` tool with detailed reason
   - Have the team fix the CSS changes
```

## Important Notes

- **Unified Tool**: Always use `read_comparison_details` with the identifier - it automatically detects the mode
- **Mode Detection**: Check the `mode` field in the response to know which viewing tool to use
- **Image Viewing**:
  - Local mode → Use Read tool with filesystem paths
  - Cloud mode → Use WebFetch tool with URLs
- **Diff Images**: NEVER attempt to view/read/fetch the diff image - it causes API errors
- **Visual Analysis**: Always view the baseline and current images before providing analysis
- Visual inspection reveals details that diff percentages alone cannot convey
