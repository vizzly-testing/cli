# Reporter tests

These are browser tests against the production HTTP server, TDD handler, and
auth, config, and project services. Each test gets its own temporary project,
config directory, report files, and available port. Decisions, settings, and
credentials use real disk storage; report updates use the real SSE connection.

Remote dependencies use fixtures: `support/cloud-api.js` simulates the Vizzly
API, and `support/fonts.js` serves a checked-in JetBrains Mono font for the
Google Fonts request. Auth tests can hold a cloud response until a specific user
action, then release it without sleeping or replacing local API routes.

## Organization

- `specs/` groups workflows by purpose: dashboard review, filtering, settings,
  builds, sign-in, viewer controls, regions, and decisions.
- `support/reporter-test.js` owns Playwright fixtures and cleanup.
- `support/reporter-server.js` and `server-process.js` start the isolated server.
- `support/report-data.js` and `write-reporter-fixture.js` prepare report files.
- `support/height-change-capture.js` uploads real PNGs through native comparison
  to verify added and removed rows in the gutter.
- `support/screenshots.js` waits for fonts and images, attaches screenshots to
  Playwright, and submits the same images through `vizzlyScreenshot`.

## Running locally

Build first with `pnpm run build`, then run `pnpm run test:reporter`. Firefox is
the default; use `REPORTER_BROWSER=chromium` to run Chromium instead. Both desktop
and phone viewports run by default. Pass a spec name to focus on one workflow.

Install the browser once with `pnpm exec playwright install firefox` (or
`chromium` when selecting Chromium). On macOS, the setup gives Firefox a
temporary app-data directory and removes it after the run. This avoids the
[macOS 27 Firefox launch issue](https://bugzilla.mozilla.org/show_bug.cgi?id=2060476)
without needing access to your personal Firefox data.

Run `pnpm run test:reporter:visual` to compare captures through Vizzly. This is
also the existing CI entry point. It includes the fullscreen layout, queue,
details, slide view, change navigation, and changed-region captures alongside
the dashboard and settings screenshots. Running Playwright directly still saves
image attachments, but does not run visual comparisons.

Captures use reduced motion and a fixed browser date so scrolling animations and
relative dates do not produce visual differences between runs.

The font fixture comes from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono)
and includes its SIL Open Font License in `fixtures/fonts/OFL.txt`.
