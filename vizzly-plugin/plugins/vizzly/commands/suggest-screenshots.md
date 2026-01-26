---
description: Analyze test files and suggest where visual screenshots would be valuable
---

# Suggest Screenshot Opportunities

Analyze the user's test files to identify good opportunities for visual regression testing.

## Step 1: Check for Auto-Discovery SDKs

Before analyzing test files, check if the project uses an SDK that auto-discovers screenshots:

**Storybook detected** (`@storybook/*` in package.json or `.storybook/` directory):
```
Your project uses Storybook!

The Storybook SDK auto-discovers all stories - no manual screenshot calls needed.

Install: npm install --save-dev @vizzly-testing/storybook
Run: npx vizzly-storybook

Each story becomes a visual test automatically.
```
Exit early - no test analysis needed.

**Static Site detected** (build directories like `dist/`, `build/`, `.next/out/`, or generators in package.json):
```
Your project appears to be a static site!

The Static Site SDK auto-discovers all pages - no manual screenshot calls needed.

Install: npm install --save-dev @vizzly-testing/static-site
Run: npx vizzly-static-site ./dist

Each page in your build output becomes a visual test automatically.
```
Exit early - no test analysis needed.

## Step 2: Find Test Files

Search for test files using these patterns:

```
**/*.test.{js,ts,jsx,tsx}
**/*.spec.{js,ts,jsx,tsx}
**/e2e/**/*.{js,ts}
**/__tests__/**/*.{js,ts,jsx,tsx}
```

**Exclude these directories:**
- `node_modules/`
- `dist/`, `build/`, `out/`
- `.next/`, `.nuxt/`, `.vite/`
- `coverage/`
- Hidden directories (`.*`)

## Step 3: Analyze Test Files

Read the test files and look for screenshot opportunities:

**High-value opportunities:**

1. **Page navigations:**
   - `.goto()`, `.visit()`, `navigate()`, `push()`
   - After routing changes complete

2. **User interactions before assertions:**
   - `.click()`, `.type()`, `.fill()`, `.check()`
   - State changes from user actions

3. **Visual assertions:**
   - `toHaveScreenshot()`, `matchImageSnapshot()`
   - Where visual testing is already attempted

4. **Wait conditions:**
   - `waitForSelector()`, `waitForLoadState()`
   - Indicates a stable state worth capturing

5. **Component renders:**
   - React Testing Library `render()`
   - Vue Test Utils `mount()`
   - After component is fully rendered

## Step 4: Suggest Screenshot Locations

For each opportunity found, suggest:

- **Line number** in the test file
- **What state** is being captured
- **Suggested screenshot name** following naming conventions
- **Why** this is a good screenshot opportunity

**Output format:**

```
Found 6 screenshot opportunities:

tests/e2e/auth.spec.ts:
  Line 12: After login page navigation
    → Screenshot: 'login-page-empty'
    Why: Full page render after navigation

  Line 28: After successful login
    → Screenshot: 'dashboard-authenticated'
    Why: Key state change - user now logged in

  Line 35: After logout
    → Screenshot: 'homepage-logged-out'
    Why: Returns to unauthenticated state

tests/e2e/checkout.spec.ts:
  Line 15: Cart page with items
    → Screenshot: 'checkout-cart-with-items'
    Why: Critical e-commerce flow state

  Line 42: Payment form
    → Screenshot: 'checkout-payment-form'
    Why: Important form state before submission

  Line 58: Order confirmation
    → Screenshot: 'checkout-confirmation'
    Why: Final state of checkout flow
```

## Step 5: Provide Integration Example

Based on the test framework detected, show a code example:

**Playwright:**
```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('user login flow', async ({ page }) => {
  await page.goto('/login');
  await vizzlyScreenshot('login-page-empty', await page.screenshot());

  await page.fill('#email', 'user@example.com');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');

  await page.waitForURL('/dashboard');
  await vizzlyScreenshot('dashboard-authenticated', await page.screenshot());
});
```

**Cypress:**
```javascript
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

describe('Login', () => {
  it('allows user to log in', () => {
    cy.visit('/login');
    cy.screenshot().then((img) => {
      vizzlyScreenshot('login-page-empty', img);
    });

    cy.get('#email').type('user@example.com');
    cy.get('#password').type('password');
    cy.get('button[type="submit"]').click();

    cy.url().should('include', '/dashboard');
    cy.screenshot().then((img) => {
      vizzlyScreenshot('dashboard-authenticated', img);
    });
  });
});
```

**Jest + Testing Library:**
```javascript
import { render, screen } from '@testing-library/react';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';
import html2canvas from 'html2canvas';

test('renders login form', async () => {
  const { container } = render(<LoginForm />);

  const canvas = await html2canvas(container);
  await vizzlyScreenshot('login-form', canvas.toDataURL());

  expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
});
```

## What NOT to Do

- Do NOT modify test files automatically
- Do NOT create new test files
- Do NOT add screenshot code without user approval

Only provide suggestions. Let the user decide which opportunities to pursue and implement themselves.

## If No Test Files Found

```
No test files found in common locations.

Looking for files matching:
- **/*.test.{js,ts,jsx,tsx}
- **/*.spec.{js,ts,jsx,tsx}
- **/e2e/**/*.{js,ts}

If your tests are in a different location, let me know the path and I'll analyze them.

Alternatively, if you're using Storybook or building a static site,
consider the auto-discovery SDKs that don't require test modifications.
```
