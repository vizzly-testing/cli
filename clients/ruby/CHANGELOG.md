# Vizzly Ruby Client Changelog

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

[Unreleased]: https://github.com/vizzly-testing/cli/compare/ruby/v0.1.0...HEAD
[0.1.0]: https://github.com/vizzly-testing/cli/releases/tag/ruby/v0.1.0
