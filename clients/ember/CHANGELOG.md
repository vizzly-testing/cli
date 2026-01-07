# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-01-07

## What's Changed

### Changed
- Removed unused remote browser configuration options (`browserWSEndpoint`, `connectOverCDP`, `rewriteUrlForDocker`) that were for an abandoned remote browser approach. Docker workflows now rely solely on the `VIZZLY_SERVER_URL` environment variable.

### Fixed
- Fixed catastrophic regex backtracking in base64 detection that caused stack overflow on large screenshots (like changelog images). Replaced with simpler non-backtracking validation logic.
- Improved error messages in screenshot server to include actual error details instead of generic 500 responses.
- Reduced console noise by only logging connection errors once instead of repeatedly.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/ember/v0.0.2...ember/v0.0.3

## [0.0.2] - 2026-01-06

## What's Changed

### Fixed
- Screenshot capture now gracefully handles connectivity errors instead of failing tests. When the Vizzly TDD server is not running or unreachable, screenshots are skipped with a console warning rather than breaking your test suite. Only intentional visual diff failures (when `failOnDiff` is enabled) will still throw errors as expected.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/ember/v0.0.1...ember/v0.0.2

## [0.0.1] - 2026-01-06

## What's Changed

### Added
- Playwright options support via `configure()` second parameter for full control over browser launch options (headless mode, slowMo, timeout, proxy, etc.)
- `--fail-on-diff` CLI flag and per-screenshot option to control whether visual differences should fail tests (defaults to false - diffs logged as warnings)
- Graceful SDK behavior when no Vizzly server is running - screenshots are skipped instead of throwing errors

### Changed
- **BREAKING**: Renamed `vizzlySnapshot()` → `vizzlyScreenshot()` for consistency with Vizzly terminology
- **BREAKING**: Renamed `vizzly-browser` binary → `vizzly-testem-launcher` to better reflect its purpose
- Browser now runs in headless mode by default (set `headless: false` in `playwrightOptions` for headed mode)
- Visual diffs no longer fail tests by default - use `--fail-on-diff` flag or per-screenshot option to enable strict mode

### Fixed
- "Browser exited unexpectedly" error when running Ember tests with Testem - launcher now properly lets Testem manage browser lifecycle
- Improved error handling and logging with stack traces - use `VIZZLY_LOG_LEVEL=debug` for detailed output
- Exit with proper error code (1) on failures instead of always returning 0
- npm bin path format in package.json for better npm compatibility
- Repository URL format in package.json

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/ember/v0.0.1-beta.1...ember/v0.0.1

## [0.0.1-beta.0] - 2026-01-04

## What's Changed

### Added

- Initial beta release of Vizzly Ember SDK for visual testing with Testem
- Custom Testem launcher using Playwright for browser control (Chromium, Firefox, WebKit)
- `vizzlyScreenshot()` helper for capturing screenshots in acceptance tests
- Automatic viewport sizing and `#ember-testing` container expansion
- TDD server auto-discovery via `.vizzly/server.json`
- Mobile viewport testing with customizable dimensions
- Support for both TDD mode (local comparison) and cloud mode

### Architecture

The SDK uses a screenshot server pattern:
- Browser tests call `vizzlyScreenshot()` which sends requests to a local screenshot server
- Screenshot server uses Playwright to capture screenshots
- Screenshots are forwarded to the Vizzly TDD server for comparison

**Full Changelog**: https://github.com/vizzly-testing/cli/commits/ember/v0.0.1-beta.0

[0.0.1-beta.0]: https://github.com/vizzly-testing/cli/releases/tag/ember/v0.0.1-beta.0
