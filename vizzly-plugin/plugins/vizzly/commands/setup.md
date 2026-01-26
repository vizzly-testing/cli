---
description: Initialize Vizzly visual testing in a project
---

# Setup Vizzly

Help the user set up Vizzly visual regression testing in their project.

## Step 1: Check If Already Configured

First, check if Vizzly is already set up:

1. Look for `vizzly.config.js` or `vizzly.config.ts` in the project root
2. Check if `@vizzly-testing/cli` is in `package.json` dependencies

If already configured, let the user know and offer to help with next steps instead.

## Step 2: Install Vizzly CLI

Install the CLI as a dev dependency:

```bash
npm install --save-dev @vizzly-testing/cli
```

Or with other package managers:
```bash
yarn add --dev @vizzly-testing/cli
pnpm add --save-dev @vizzly-testing/cli
```

## Step 3: Initialize Configuration

Run the init command to create the config file:

```bash
npx vizzly init
```

This creates `vizzly.config.js` with sensible defaults.

## Step 4: Update .gitignore

Add `.vizzly/` to `.gitignore` to avoid committing local TDD artifacts:

```
# Vizzly
.vizzly/
```

The baselines can optionally be committed (they're in `.vizzly/baselines/`) but typically you'll use cloud mode for team collaboration.

## Step 5: Detect Project Type and Recommend SDK

Check the project to determine which SDK to recommend:

**Check in this order:**

1. **Ruby project** (has `Gemfile`):
   ```
   For Ruby projects, install the Ruby SDK:
   gem install vizzly

   Documentation: https://docs.vizzly.dev/integration/sdk/ruby/overview
   ```

2. **Storybook** (has `@storybook/*` in package.json or `.storybook/` directory):
   ```
   For Storybook, install the Storybook SDK:
   npm install --save-dev @vizzly-testing/storybook

   The Storybook SDK auto-discovers all your stories.
   Documentation: https://docs.vizzly.dev/integration/sdk/storybook/overview
   ```

3. **Static Site** (has static generators like `astro`, `next`, `gatsby`, `vitepress`, `eleventy` in package.json, or build directories like `dist/`, `build/`):
   ```
   For static sites, install the Static Site SDK:
   npm install --save-dev @vizzly-testing/static-site

   The Static Site SDK auto-discovers all pages in your build output.
   Documentation: https://docs.vizzly.dev/integration/sdk/static-site/overview
   ```

4. **JavaScript/Node.js** (has `package.json`):
   ```
   The JavaScript SDK is included with the CLI you just installed.

   Import in your tests:
   import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

   Documentation: https://docs.vizzly.dev/integration/sdk/javascript/overview
   ```

## Step 6: Provide Environment Setup Instructions

**For local development:**

```
For local TDD mode, no token is needed!
Just run: vizzly tdd start

For cloud features, create a .env file:
VIZZLY_TOKEN=your-api-token-here

Add .env to .gitignore
```

**For CI/CD:**

```
Add VIZZLY_TOKEN as a secret in your CI provider.

Example GitHub Actions:
env:
  VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

## Step 7: Summary

End with a summary of what was accomplished:

```
Setup Complete!

What was done:
✅ Vizzly CLI installed
✅ Configuration file created (vizzly.config.js)
✅ .vizzly/ added to .gitignore

Next steps:
1. Install the recommended SDK (see above)
2. Add screenshot calls to your tests
3. Run `vizzly tdd start` to begin local development
4. Open http://localhost:47392 to view the dashboard

Try it now:
  vizzly tdd start
  npm test
```

## What NOT to Do

- Do NOT modify their test files
- Do NOT generate example test code
- Do NOT create new test files
- Do NOT make assumptions about their test framework

Let the user integrate Vizzly into their existing tests themselves. Just provide installation and setup.
