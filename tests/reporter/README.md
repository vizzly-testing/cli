# Reporter tests

These browser tests use the real HTTP server, TDD handler, and local services.
Each test gets a temporary project, config, report files, and port. Decisions,
settings, and credentials go to disk; report updates arrive over SSE.

Remote dependencies use fixtures. `support/cloud-api.js` stands in for the
Vizzly API, and `support/fonts.js` serves a checked-in font for Google Fonts
requests. Auth tests can hold a response until a user action, then release it
without sleeps or replacing local routes.

## Run locally

Install Firefox once, then build and run the tests:

```bash
pnpm exec playwright install firefox
pnpm run build
pnpm run test:reporter
```

Tests run at desktop and phone sizes. Pass a spec name to focus on one workflow.
To use Chromium, install it and set `REPORTER_BROWSER=chromium`.

On macOS, Firefox gets a temporary app-data folder that's removed after the run.
This avoids the [macOS 27 launch issue](https://bugzilla.mozilla.org/show_bug.cgi?id=2060476)
without accessing your personal Firefox data.

## Compare screenshots

Run `pnpm run test:reporter:visual` to start a local Vizzly server and compare
captures. CI uses this too. It captures the dashboard, settings, fullscreen
viewer, queue, details, slide view, change navigation, and changed regions.

Captures always save Playwright image attachments. Direct Playwright runs also
send screenshots to Vizzly when a screenshot server is available.

Captures use reduced motion and a fixed date to keep animations and relative
dates from changing the screenshots.

## Find the test helpers

- `specs/`: review, filtering, settings, builds, sign-in, viewer, and region tests.
- `support/reporter-test.js`: fixtures and cleanup.
- `support/reporter-server.js` and `server-process.js`: start the test server.
- `support/report-data.js` and `write-reporter-fixture.js`: create report files.
- `support/screenshots.js`: wait for fonts and images, attach screenshots to
  Playwright, and send them through `vizzlyScreenshot`.

The font fixture is [JetBrains Mono from Google Fonts](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono).
Its SIL Open Font License is in `fixtures/fonts/OFL.txt`.
