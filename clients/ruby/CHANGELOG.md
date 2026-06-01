# Vizzly Ruby Client Changelog

## [0.3.0] - 2026-06-01

## What's Changed

### Added
- Added `fail_on_diff` support for local TDD visual diffs. Configure it with
  `Vizzly::Client.new(fail_on_diff: true)`, `VIZZLY_FAIL_ON_DIFF=true`, or
  the local TDD server setting to raise `Vizzly::Error` when a visual diff is
  detected.
- Added per-screenshot `build_id` and `request_timeout` options, with
  snake_case Ruby names and camelCase aliases for JavaScript API parity.
- Added `VIZZLY_ENABLED=false` support to disable screenshot capture from the
  environment.
- Added richer `Client#info` output, including `serverUrl`, `buildId`,
  `fail_on_diff`, and `failOnDiff`.

### Changed
- Screenshot option handling now separates Vizzly options from user metadata.
  Reserved options passed inside `properties` are promoted to the correct
  request fields and emit a warning so `properties` can remain user metadata.
- `threshold` now accepts numeric values and is documented as a Delta E
  comparison threshold.

### Fixed
- Fixed request handling for HTTPS `server_url` values.
- Fixed screenshot option serialization for string-keyed options, camelCase
  aliases, zero values, fractional thresholds, and nested metadata hashes.
- Fixed local TDD diff handling so both current successful diff responses and
  legacy `422` diff responses are handled consistently when `fail_on_diff` is
  enabled.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/ruby/v0.2.1...ruby/v0.3.0


## [0.2.1] - 2026-02-04

### Changed
- Improved packaging and release metadata.


## [0.2.0] - 2026-01-07

### Added
- Support for `min_cluster_size` and `full_page` screenshot options.
- Browser E2E coverage for Ruby screenshot capture.


All notable changes to the Vizzly Ruby client will be documented in this file.

This changelog is automatically generated when releasing new versions.

## [Unreleased]

## [0.1.0] - 2025-10-07

### Added
- Initial release of Vizzly Ruby client SDK
- Auto-discovery of TDD server via `.vizzly/server.json`
- Full HTTP API implementation matching JavaScript client
- Support for screenshot capture with properties, threshold, and fullPage options
- Module-level and instance-level API
- Zero external dependencies (stdlib only)
- Comprehensive test suite with unit and integration tests
- RSpec integration example in README

### Features
- `Vizzly.screenshot()` - Module-level screenshot capture
- `Vizzly::Client` - Instance-based client for advanced usage
- Auto-discovery of local TDD server
- Environment variable configuration (`VIZZLY_SERVER_URL`, `VIZZLY_BUILD_ID`)
- Graceful error handling and auto-disable on failure
- TDD mode visual diff warnings with dashboard links

[Unreleased]: https://github.com/vizzly-testing/cli/compare/ruby/v0.2.1...HEAD
[0.2.1]: https://github.com/vizzly-testing/cli/releases/tag/ruby/v0.2.1
[0.2.0]: https://github.com/vizzly-testing/cli/releases/tag/ruby/v0.2.0
[0.1.0]: https://github.com/vizzly-testing/cli/releases/tag/ruby/v0.1.0
