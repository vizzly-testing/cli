---
name: visual-testing-philosophy
description: Visual testing best practices and philosophy. Use when the user is adding visual tests, writing test code, deciding where to add screenshots, or asking about screenshot best practices.
---

# Visual Testing Philosophy

When helping users add or improve visual tests, follow these principles and best practices.

## Core Philosophy

**Visual tests capture the REAL thing.**

Unlike component libraries that render in isolation, Vizzly captures screenshots from your actual functional tests - the same tests that verify your app works. This means:

- You're testing what users actually see
- Integration issues are caught (not just isolated components)
- Visual tests are a byproduct of existing tests, not extra work

## When to Add Visual Tests

**High-value screenshot opportunities:**

1. **After page navigations** - Full page renders after `goto()` or routing changes
2. **After user interactions** - State changes from clicks, form submissions, etc.
3. **Critical user flows** - Checkout, login, onboarding, settings
4. **Different viewport sizes** - Desktop, tablet, mobile breakpoints
5. **Different user states** - Logged in/out, empty/full data, error states

**Lower value (consider skipping):**

- Loading spinners (inherently unstable)
- Animations mid-transition
- Highly dynamic content (dates, random data)
- Third-party content you don't control

## Screenshot Naming Conventions

Good names are descriptive, consistent, and sortable.

**Pattern:** `<feature>-<state>-<variant>`

**Good examples:**
```
homepage-desktop
homepage-mobile
login-form-empty
login-form-filled
login-form-error
checkout-cart-with-items
checkout-cart-empty
user-profile-settings-tab
```

**Avoid:**
```
test1                    # Not descriptive
page                     # Too generic
myComponent              # CamelCase inconsistent
home_page_after_login    # Underscores (use hyphens)
```

**Include viewport when testing responsive:**
```
homepage-1920x1080
homepage-768x1024
homepage-375x667
```

## Best Practices for Stable Screenshots

### 1. Wait for Stability

Capture screenshots after the page is fully loaded:

```javascript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Or wait for specific element
await page.waitForSelector('.main-content');

// Then screenshot
await vizzlyScreenshot('homepage', await page.screenshot());
```

### 2. Handle Dynamic Content

Mock or stabilize dynamic data:

```javascript
// Mock dates
await page.evaluate(() => {
  Date.now = () => new Date('2024-01-01').getTime();
});

// Hide dynamic elements
await page.evaluate(() => {
  document.querySelector('.timestamp')?.remove();
});
```

### 3. Disable Animations

Prevent animation-related flakiness:

```javascript
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
    }
  `
});
```

### 4. Use Meaningful Thresholds

Configure thresholds based on your needs:

```javascript
// In vizzly.config.js
export default defineConfig({
  threshold: 0.1,  // 0.1% - strict, catches minor changes
  // threshold: 1.0,  // 1% - lenient, ignores anti-aliasing
  // threshold: 0,    // 0% - pixel-perfect (may be flaky)
});
```

**Threshold guidelines:**
- `0.05% - 0.1%` - Most projects, catches real changes, ignores rendering noise
- `0.5% - 1%` - If you have font rendering issues across environments
- `2%+` - Only for very dynamic UIs or when stability is a problem

## What Makes a Good Visual Test

**A good visual test:**
- Captures a stable, representative state
- Has a descriptive name that explains what's being tested
- Runs consistently across environments
- Catches real visual regressions
- Doesn't flake on unimportant changes

**A bad visual test:**
- Captures loading states or animations
- Has vague naming ("test1", "page")
- Includes timestamps or random data
- Breaks on every run due to dynamic content
- Tests third-party widgets you don't control

## Adding Screenshots to Existing Tests

When adding visual tests to an existing test suite:

1. **Identify key states** - What are the important visual states in this test?
2. **Add screenshots after assertions** - The test already waits for the right state
3. **Use descriptive names** - Match the test description
4. **Run and review** - Check the first screenshots look correct
5. **Accept baselines** - These become your reference

**Example integration:**

```javascript
test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await vizzlyScreenshot('login-form-empty', await page.screenshot());

  await page.fill('#email', 'user@example.com');
  await page.fill('#password', 'password');
  await vizzlyScreenshot('login-form-filled', await page.screenshot());

  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
  await vizzlyScreenshot('dashboard-after-login', await page.screenshot());
});
```

## TDD Workflow

The visual TDD workflow:

1. **Start TDD server:** `vizzly tdd start`
2. **Run tests in watch mode:** Your test runner with `--watch`
3. **Make changes** - Code updates trigger test reruns
4. **Review in dashboard** - See visual changes at `http://localhost:47392`
5. **Accept or fix** - Accept intentional changes, fix regressions
6. **Repeat** - Iterate until visual tests pass

## Common Pitfalls

**Flaky tests:**
- Usually caused by animations, loading states, or dynamic content
- Solution: Wait for stability, mock data, disable animations

**Too many screenshots:**
- Don't screenshot everything - focus on critical states
- Quality over quantity

**Brittle baselines:**
- If baselines break constantly, your thresholds may be too strict
- Or you're capturing unstable states

**Ignoring failures:**
- Don't blindly accept all changes
- Each failure is either a regression to fix or a change to consciously accept
