# Vitest integration tests

These browser tests show how to use `toMatchScreenshot()`, custom properties,
and Vitest's Playwright browser mode with Vizzly.

## Run locally

From `clients/vitest`, install dependencies and Chromium, then start Vizzly
and run the tests:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm exec vizzly tdd start --open
pnpm run test:e2e
```

Review results at the dashboard URL Vizzly prints. Baselines live in
`.vizzly/baselines/`.

## Run with cloud review

Set `VIZZLY_TOKEN`, then run:

```bash
pnpm exec vizzly run "pnpm run test:e2e"
```

CI runs the Node unit tests and these browser tests. The browser run uploads
screenshots for review.
