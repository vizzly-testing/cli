---
description: Check TDD dashboard status and view visual regression test results
---

# Check Vizzly TDD Status

Use the Vizzly MCP server to check the current TDD status:

1. Call the `get_tdd_status` tool from the vizzly MCP server
2. Analyze the comparison results
3. Show a summary of:
   - Total screenshots tested
   - Passed, failed, and new screenshot counts
   - List of failed comparisons with diff percentages
   - Available diff images to inspect
4. If TDD server is running, provide the dashboard URL
5. For failed comparisons, provide guidance on next steps

## Example Output Format

```
Vizzly TDD Status:
✅ Total: 15 screenshots
✅ Passed: 12
❌ Failed: 2 (exceeded threshold)
🆕 New: 1 (no baseline)

Failed Comparisons:
- homepage (2.3% diff) - Check .vizzly/diffs/homepage.png
- login-form (1.8% diff) - Check .vizzly/diffs/login-form.png

New Screenshots:
- dashboard (no baseline for comparison)

Dashboard: http://localhost:47392

Next Steps:
- Review diff images to understand what changed
- Accept baselines from dashboard if changes are intentional
- Fix visual issues if changes are unintentional
```

Focus on providing actionable information to help the developer understand what's failing and why.
