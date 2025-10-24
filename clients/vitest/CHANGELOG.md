# Changelog

All notable changes to `@vizzly-testing/vitest` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-10-23

### Added

- Initial release of Vitest browser mode integration
- Custom `toMatchVizzlyScreenshot()` matcher for visual regression testing
- Custom `toMatchVizzlySnapshot()` matcher (alias)
- `setupVizzlyMatchers()` function to register custom matchers
- `takeVizzlyScreenshot()` imperative API
- `getVizzlyStatus()` helper to check Vizzly availability
- `vizzlyTest()` conditional test helper
- Support for both page and element screenshots
- Rich metadata support via `properties` option
- Configurable comparison thresholds
- Full integration with Vizzly TDD mode and Cloud mode
- CI/CD ready with parallel execution support
- Comprehensive documentation and examples

### Features

- **TDD Mode** - Interactive local dashboard for rapid development
- **Cloud Mode** - Team collaboration with visual reviews
- **Familiar API** - Feels like native Vitest with expect() syntax
- **Auto-discovery** - Automatically finds running TDD server
- **Graceful degradation** - Silently skips when Vizzly not available
- **Cross-platform** - SHA-based deduplication across different OS/browsers

[0.1.0]: https://github.com/vizzly-testing/cli/releases/tag/vitest-v0.1.0
