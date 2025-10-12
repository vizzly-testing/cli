---
description: Initialize Vizzly visual testing in a project
---

# Setup Vizzly in Project

Help the user set up Vizzly visual regression testing in their project.

## Setup Steps

**Execute steps 1-5 to complete the CLI setup, then proceed to step 6 for SDK recommendations.**

1. **Check if Vizzly is already configured**
   - Look for `vizzly.config.js` in the project root
   - Check if `@vizzly-testing/cli` is in package.json
   - If already configured, inform the user and exit

2. **Install Vizzly CLI**

   Run this command:

   ```bash
   npm install --save-dev @vizzly-testing/cli
   ```

3. **Initialize configuration**

   Run this command:

   ```bash
   npx vizzly init
   ```

   This creates `vizzly.config.js` with sensible defaults.

4. **Add .vizzly/ to .gitignore**

   Add `.vizzly/` to the project's `.gitignore` file to avoid committing local TDD artifacts.

5. **Environment Variables**

   Present the user with instructions to set up their API token:

   **For local development:**
   Create a `.env` file:

   ```
   VIZZLY_TOKEN=your-api-token-here
   ```

   Add `.env` to `.gitignore`

   **For CI/CD:**
   Add `VIZZLY_TOKEN` as a secret in their CI provider

6. **Next Steps**

   After CLI setup is complete, detect the project type and recommend the appropriate SDK:

   **SDK Detection Priority (check in this order):**
   - **Ruby**: Check for `Gemfile` → Recommend Ruby SDK
   - **Storybook**: Check for `@storybook/*` in package.json or `.storybook/` directory → Recommend Storybook SDK
   - **Static Site**: Check for static site generators (`astro`, `next`, `gatsby`, `vitepress`, `eleventy` in package.json) or build directories (`dist/`, `build/`, `.next/out/`, `_site/`) → Recommend Static Site SDK
   - **JavaScript/Node.js**: Check for `package.json` → Recommend JavaScript SDK

   **Present the detected SDK recommendation:**

   For Ruby:

   ```
   📦 Next: Install the Ruby SDK
   gem install vizzly

   Documentation: https://docs.vizzly.dev/integration/sdk/ruby/overview
   ```

   For Storybook:

   ```
   📦 Next: Install the Storybook SDK
   npm install --save-dev @vizzly-testing/storybook

   Documentation: https://docs.vizzly.dev/integration/sdk/storybook/overview
   ```

   For Static Site:

   ```
   📦 Next: Install the Static Site SDK
   npm install --save-dev @vizzly-testing/static-site

   Documentation: https://docs.vizzly.dev/integration/sdk/static-site/overview
   ```

   For JavaScript:

   ```
   📦 Next: Use the JavaScript SDK (already included with the CLI)

   Documentation: https://docs.vizzly.dev/integration/sdk/javascript/overview
   ```

   **End with this context summary:**

   ```
   ✅ Setup Complete

   What was accomplished:
   - Vizzly CLI installed
   - Configuration file created (vizzly.config.js)
   - .vizzly/ added to .gitignore
   - Environment variable instructions provided

   What's next:
   - Install the recommended SDK (see above)
   - Add screenshot capture to your tests (if needed)
   - Run `vizzly tdd start` to test locally

   [For Claude: The CLI is now installed and configured. When the user returns saying they installed the SDK, help them integrate it into their tests and start capturing screenshots. The workflow is: install SDK → add screenshot calls to tests → run vizzly tdd to verify locally.]
   ```

## What NOT to Do

- Do not modify their test files
- Do not generate example test code
- Do not make assumptions about their test framework
- Do not create new test files

## What to Provide

- Installation commands
- Configuration file creation
- Environment setup guidance
- Links to documentation
- Next steps for integration

Let the user integrate Vizzly into their existing tests themselves. Vizzly works with any test framework that can capture screenshots.
