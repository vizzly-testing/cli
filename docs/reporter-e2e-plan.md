# Reporter E2E Test Implementation Plan

Implementation plan for [GitHub Issue #124](https://github.com/vizzly-testing/cli/issues/124).

## Evaluation & Philosophy

### What We're Testing

The reporter is a React SPA with two modes:
1. **Live TDD mode** - Real-time dashboard polling a local server
2. **Static mode** - Self-contained HTML report with embedded JSON

The test server (`createReporterTestServer`) already handles this well - it serves the real React bundle with fixture data injected via `window.VIZZLY_REPORTER_DATA`. This is exactly the right approach: **we test the real app with controlled initial state**.

### High-Value Test Criteria

Tests should exercise **complete user journeys**, not isolated units. Each test should:
- Start from the reporter home page (or a specific route)
- Perform actions a real user would take
- Verify outcomes the user would see
- Cover the "happy path" plus critical edge cases

### What NOT to Test

- Individual component rendering (that's what visual regression tests are for)
- Internal state management details
- API response shapes (those are implementation details)
- Things that can't break from a user's perspective

### Current Coverage Assessment

The existing 7 visual tests cover:
- Empty state ✓
- List views (passed/failed) ✓
- Fullscreen viewer modes (overlay/slide) ✓
- Static page views (stats/settings/projects) ✓

What's missing are **interaction-based tests** - clicking, filtering, keyboard navigation, mutations.

---

## Revised Test Plan: User Journey Focus

Instead of 12+ granular spec files, we'll organize around **user workflows**. Each spec tests a complete journey.

### Spec 1: `review-workflow.spec.js` (Highest Priority)

The core user journey: reviewing visual differences and accepting/rejecting baselines.

```javascript
test.describe('Review Workflow', () => {
  // Journey: User opens reporter, sees failed comparisons, reviews one, accepts it
  test('review and accept a failed comparison', async ({ page }) => {
    // Load mixed fixture (has passed, failed, new)
    // Navigate to home - see failed count in filter badges
    // Click "Failed" filter - only failed comparisons shown
    // Click a failed comparison card - opens fullscreen viewer
    // Verify diff overlay is shown
    // Click "Approve" button
    // Verify comparison now shows as approved
    // Press ESC or click X - return to list
    // Verify list shows updated state
  })

  test('reject a comparison and see it marked', async ({ page }) => {
    // Similar flow, but click Reject
    // Verify rejected state persists
  })

  test('accept all comparisons via bulk action', async ({ page }) => {
    // Load fixture with multiple failed/new
    // Click "Accept All" button
    // Verify confirmation dialog appears
    // Confirm
    // Verify all comparisons show accepted state
  })

  test('cancel bulk accept via confirmation dialog', async ({ page }) => {
    // Click "Accept All"
    // Click cancel in dialog
    // Verify nothing changed
  })
})
```

### Spec 2: `navigation-and-keyboard.spec.js`

The fullscreen viewer navigation experience.

```javascript
test.describe('Viewer Navigation', () => {
  test('navigate through comparisons with arrow keys', async ({ page }) => {
    // Load fixture with 3+ comparisons
    // Open first comparison
    // Press ArrowRight - verify second comparison shown
    // Press ArrowRight - verify third comparison shown
    // Press ArrowLeft - back to second
    // Verify filmstrip highlights current item
  })

  test('close viewer with ESC key', async ({ page }) => {
    // Open a comparison
    // Press Escape
    // Verify back on list view
  })

  test('navigate between comparisons using filmstrip', async ({ page }) => {
    // Open a comparison
    // Click different thumbnail in filmstrip
    // Verify that comparison is now shown
  })

  test('deep link directly to a comparison', async ({ page }) => {
    // Navigate directly to /comparison/some-id
    // Verify that comparison loads correctly
    // Verify can navigate from there
  })
})
```

### Spec 3: `filtering-and-search.spec.js`

Finding specific comparisons in the list.

```javascript
test.describe('Filtering and Search', () => {
  test('filter by status shows correct comparisons', async ({ page }) => {
    // Load mixed fixture
    // Click "Failed" - only failed shown, count matches
    // Click "Passed" - only passed shown
    // Click "New" - only new shown
    // Click "All" - all shown
  })

  test('search filters by comparison name', async ({ page }) => {
    // Load fixture with distinct names
    // Type in search box
    // Verify only matching comparisons shown
    // Clear search - all comparisons return
  })

  test('filter by browser', async ({ page }) => {
    // Load fixture with chrome/firefox/safari comparisons
    // Select "Chrome" from browser dropdown
    // Verify only chrome comparisons shown
  })

  test('combine filters: status + browser + search', async ({ page }) => {
    // Apply multiple filters
    // Verify correct intersection shown
    // Verify "no matches" state when filters exclude everything
    // Click "Clear all filters" - everything returns
  })

  test('filter state persists in URL', async ({ page }) => {
    // Apply filters
    // Verify URL updated
    // Reload page
    // Verify filters still applied
  })
})
```

### Spec 4: `viewer-modes.spec.js`

The different comparison view modes.

```javascript
test.describe('Comparison View Modes', () => {
  test('switch between overlay, toggle, and slide modes', async ({ page }) => {
    // Open a failed comparison (has diff)
    // Verify overlay mode active by default
    // Click Toggle - verify toggle mode active
    // Click Slide - verify slide mode active, slider visible
    // Drag slider - images update
  })

  test('zoom controls work correctly', async ({ page }) => {
    // Open a comparison
    // Click zoom in - verify zoom increases
    // Click zoom out - verify zoom decreases
    // Click "Fit" - verify fit mode
    // Click "1:1" - verify actual size
  })

  test('view modes disabled for passed comparisons without diff', async ({ page }) => {
    // Open a passed comparison (no diff image)
    // Verify view mode buttons are disabled
    // Only current image displayed
  })
})
```

### Spec 5: `settings-workflow.spec.js`

Managing configuration through the UI.

```javascript
test.describe('Settings Workflow', () => {
  test('view and update threshold setting', async ({ page }) => {
    // Navigate to /settings
    // Verify current threshold displayed
    // Change threshold value
    // Click Save
    // Verify success toast
    // Reload - verify value persisted
  })

  test('form validation prevents invalid values', async ({ page }) => {
    // Try to set threshold to invalid value (negative, >100, non-number)
    // Verify save button disabled or error shown
  })

  test('revert changes before saving', async ({ page }) => {
    // Change a value
    // Click Revert
    // Verify original value restored
  })
})
```

### Spec 6: `projects-auth-workflow.spec.js` (Lower Priority)

Cloud integration features.

```javascript
test.describe('Projects and Authentication', () => {
  test('shows login prompt when not authenticated', async ({ page }) => {
    // Navigate to /projects (with unauthenticated fixture)
    // Verify "Not signed in" message
    // Verify login button visible
  })

  test('shows project list when authenticated', async ({ page }) => {
    // Use authenticated fixture with projects
    // Navigate to /projects
    // Verify project list displayed
    // Verify link/unlink options available
  })
})
```

---

## Fixture Strategy

### Keep It Simple

We don't need many fixtures. The key is having one "rich" fixture that covers most scenarios:

**`mixed-state.json`** (the workhorse):
- 2 passed (different browsers)
- 2 failed (with diffs, different viewports)
- 1 new (no baseline)
- Distinct names for search testing

This single fixture can power most tests. We'll reuse existing fixtures where appropriate:
- `empty-state.json` - already exists, keep for edge case
- `passed-state.json` - already exists, useful for "all passing" scenario
- `failed-state.json` - already exists, useful for review workflow

### Test Server Enhancements

The test server needs one key addition: **mutation handling**.

```javascript
// Track mutations so tests can verify actions were taken
let mutations = []

// Handle baseline accept/reject
if (method === 'POST' && pathname.startsWith('/api/baselines/')) {
  let id = pathname.split('/').pop()
  let body = await collectBody(req)
  mutations.push({ id, action: body.action, timestamp: Date.now() })
  return json({ success: true })
}

// Expose mutations for test verification
if (pathname === '/__test__/mutations') {
  return json({ mutations })
}

// Reset mutations between tests
if (pathname === '/__test__/reset') {
  mutations = []
  return json({ ok: true })
}
```

This way tests can verify the correct API calls were made without mocking - the real UI makes real HTTP calls.

---

## Implementation Order

Start with highest-value tests and work incrementally:

**Batch 1: Core Review Workflow** (3-4 tests)
1. Create `mixed-state.json` fixture
2. Add mutation tracking to test server
3. Write `review-workflow.spec.js` - accept/reject single comparison

**Batch 2: Navigation** (3-4 tests)
4. Write `navigation-and-keyboard.spec.js` - arrow keys, ESC, filmstrip

**Batch 3: Filtering** (4-5 tests)
5. Write `filtering-and-search.spec.js` - status, search, browser, combined

**Batch 4: Viewer Modes** (3 tests)
6. Write `viewer-modes.spec.js` - overlay/toggle/slide, zoom

**Batch 5: Settings** (3 tests)
7. Write `settings-workflow.spec.js` - edit, save, validation

**Batch 6: Auth/Projects** (2 tests, if needed)
8. Write `projects-auth-workflow.spec.js` - conditional on cloud features

Each batch is 2-3 working sessions, testable independently.

---

## Architectural Improvements (Separate from Testing)

These are from the issue but should be tackled separately after tests are in place:

1. **Error Boundaries** - Wrap views to catch React errors gracefully
2. **Loading States** - Consistent skeletons across views
3. **Optimistic Updates** - Instant UI feedback on baseline acceptance
4. **Accessibility** - Focus trapping in modals, ARIA labels
5. **Performance** - React.memo, virtualization for large lists

The tests we write will make it safer to implement these improvements.

---

## Success Criteria

- **6 spec files** covering complete user journeys
- **~20 high-value tests** total (not 50+ granular ones)
- Each test runs the real React app with fixture data
- No mocking of React components or hooks
- Tests verify what users see, not implementation details
- CI completes in < 60 seconds
