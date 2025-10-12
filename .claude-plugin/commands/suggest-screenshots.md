---
description: Analyze test files and suggest where visual screenshots would be valuable
---

# Suggest Screenshot Opportunities

Analyze existing test files to identify ideal locations for visual regression testing.

## Process

1. **Detect SDK type** (same logic as setup command)

   **If Storybook detected** (`@storybook/*` in package.json or `.storybook/` directory):
   - Inform user that Storybook SDK auto-discovers all stories
   - No manual screenshot calls needed
   - Exit early

   **If Static Site detected** (build directories like `dist/`, `build/`, `.next/out/` or static site generators):
   - Inform user that Static Site SDK auto-discovers all pages
   - No manual screenshot calls needed
   - Exit early

   **Otherwise continue** with test file analysis below.

2. **Ask user for test directory** if not obvious (e.g., `tests/`, `e2e/`, `__tests__/`, `spec/`)

3. **Find test files** using glob patterns:
   - `**/*.test.{js,ts,jsx,tsx}`
   - `**/*.spec.{js,ts,jsx,tsx}`
   - `**/e2e/**/*.{js,ts}`

   **IMPORTANT: Exclude these directories:**
   - `node_modules/`
   - `dist/`, `build/`, `out/`
   - `.next/`, `.nuxt/`, `.vite/`
   - `coverage/`, `.nyc_output/`
   - `vendor/`
   - Any hidden directories (`.*/`)

   Use the Glob tool with explicit exclusion or filter results to avoid these directories.

4. **Analyze test files** looking for:
   - Page navigations (`.goto()`, `.visit()`, `navigate()`)
   - User interactions before assertions (`.click()`, `.type()`, `.fill()`)
   - Component rendering (React Testing Library, etc.)
   - Visual assertions or wait conditions

5. **Suggest screenshot points** where:
   - After page loads or navigations
   - After key user interactions
   - Before visual assertions
   - At different viewport sizes
   - For different user states (logged in/out, etc.)

6. **Provide code examples** specific to their test framework:

   **Playwright:**

   ```javascript
   import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

   // After page navigation
   await page.goto('/dashboard');
   await vizzlyScreenshot('dashboard-logged-in', await page.screenshot(), {
     browser: 'chrome',
     viewport: '1920x1080'
   });
   ```

   **Cypress:**

   ```javascript
   cy.visit('/login');
   cy.screenshot('login-page');
   // Then add vizzlyScreenshot in custom command
   ```

## Output Format

```
Found 8 potential screenshot opportunities in your tests:

tests/e2e/auth.spec.js:
  Line 15: After login page navigation
    Suggested screenshot: 'login-page'
    Reason: Page load after navigation

  Line 28: After successful login
    Suggested screenshot: 'dashboard-authenticated'
    Reason: User state change (logged in)

tests/e2e/checkout.spec.js:
  Line 42: Shopping cart with items
    Suggested screenshot: 'cart-with-items'
    Reason: Visual state after user interaction

  Line 67: Checkout confirmation page
    Suggested screenshot: 'order-confirmation'
    Reason: Final state of user flow

Example integration for Playwright:
[Provide code example specific to their test]
```

## Important Notes

- **Do NOT modify test files**
- **Do NOT create new test files**
- Only provide suggestions and examples
- Let the user decide where to add screenshots
- Respect their test framework and structure
