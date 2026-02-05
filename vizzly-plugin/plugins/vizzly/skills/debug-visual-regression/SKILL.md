---
name: debug-visual-regression
description: Analyze visual regression test failures in Vizzly. Use when the user mentions failing visual tests, screenshot differences, visual bugs, diffs, or asks to debug/investigate/analyze visual changes.
---

# Debug Visual Regression

When a user mentions failing visual tests or screenshot differences, follow these steps to investigate and help them understand what changed.

## Step 1: Read the Comparison Data

Use the Read tool to get `.vizzly/report-data.json`:

```
Read .vizzly/report-data.json
```

**If the file is too large**, use Bash to extract just the failing comparisons:
```bash
cat .vizzly/report-data.json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  console.log(JSON.stringify(data.comparisons?.filter(c => c.status === 'failed'), null, 2));
"
```

Find the failing comparison in the `comparisons` array. Each comparison has:
- `name` - Screenshot identifier
- `status` - "failed", "passed", or "new"
- `diffPercentage` - How much the screenshot differs (percentage)
- `threshold` - The allowed difference threshold
- `current` - Path to current screenshot (relative, like `/images/current/name.png`)
- `baseline` - Path to baseline screenshot
- `diff` - Path to diff image

## Step 2: View the Screenshots

Convert the paths from report-data.json to filesystem paths:
- `/images/current/name.png` → `.vizzly/current/name.png`
- `/images/baselines/name.png` → `.vizzly/baselines/name.png`

**Note:** If paths don't match this format, use the screenshot `name` field directly:
- Baseline: `.vizzly/baselines/{name}.png`
- Current: `.vizzly/current/{name}.png`

Use the Read tool to view both images:
1. Read the baseline image: `.vizzly/baselines/<name>.png`
2. Read the current image: `.vizzly/current/<name>.png`

**Skip the diff image** (`.vizzly/diffs/`): The diff images are algorithmically generated overlays that highlight pixel differences. They're useful for humans in the dashboard but not helpful for AI analysis - comparing the actual baseline and current images directly gives you better context about what changed.

## Step 3: Analyze the Visual Differences

Compare the two images and describe what you observe:

**Look for:**
- Layout shifts (elements moved, spacing changed)
- Color changes (backgrounds, text, borders)
- Content changes (text, images, icons)
- Missing or added elements
- Typography changes (font size, weight, family)
- State differences (hover, focus, loading states)

**Categorize by diff percentage:**
- **< 1%:** Anti-aliasing, font rendering, subpixel differences - often acceptable
- **1-5%:** Layout shifts, padding/margin changes, color variations - investigate
- **> 5%:** Significant changes - likely needs attention

## Step 4: Identify Possible Causes

Based on what you observe, suggest likely causes:

**CSS changes:**
- Margin/padding adjustments
- Positioning changes
- Color or background modifications
- Font changes

**Content changes:**
- Dynamic text or data
- Date/time displays
- User-generated content

**State issues:**
- Screenshot captured during loading
- Hover state captured unintentionally
- Animation frame captured

**Environment differences:**
- Browser version changed
- Font availability
- Screen resolution

## Step 5: Suggest Next Steps

**If the change is intentional:**
Explain that they can accept the new baseline:
- Via the TDD dashboard at `http://localhost:47392`
- Via CLI (cloud): `vizzly comparisons -b <build-id>` to find ID, then `vizzly approve <id>`
- Via file copy (local TDD): `cp .vizzly/current/<name>.png .vizzly/baselines/<name>.png`

**If the change is unintentional:**
Help them investigate:
- Suggest specific files to check based on what changed
- Recommend git commands to find recent changes: `git diff --name-only HEAD~5`
- Point to likely CSS or component files

**If it's unclear:**
Ask clarifying questions:
- "Was this change expected as part of recent work?"
- "Should the button text have changed from X to Y?"

## Example Analysis

```
Based on the comparison data and viewing both screenshots:

**Screenshot:** homepage
**Diff:** 2.3% (threshold: 0.1%)

**What I observed:**
The navigation header has shifted down by approximately 15 pixels. The logo
is now positioned lower, and the nav items are overlapping slightly with
the hero section below.

**Likely cause:**
This appears to be a margin or padding change on the header element. The
layout shift suggests CSS was modified.

**Suggested investigation:**
Check recent changes to header styles:
- `src/components/Header.css` or similar
- Any global layout styles

Run: `git diff HEAD~3 -- "*.css" | grep -A5 -B5 "header\|nav"`

**If intentional:**
Accept the new baseline:
- TDD dashboard at `http://localhost:47392`
- Cloud: `vizzly comparisons -b <build-id>` → `vizzly approve <id>`
- Local TDD: `cp .vizzly/current/homepage.png .vizzly/baselines/homepage.png`
```

## When TDD Server Isn't Running

If `.vizzly/report-data.json` doesn't exist or is empty, the TDD server may not be running:

1. Check if server is running: Look for `.vizzly/server.json`
2. If not running, suggest: `vizzly tdd start`
3. Then run tests to generate screenshots

## Tips for Better Analysis

- Always view BOTH baseline and current images before analyzing
- Be specific about what changed (not just "it looks different")
- Quantify changes when possible ("shifted ~15px", "color changed from #fff to #f0f0f0")
- Consider the context of recent code changes
- Ask if you need more information about what the user was working on
