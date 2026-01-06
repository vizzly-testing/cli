# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
