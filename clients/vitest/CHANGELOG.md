# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2025-10-25

## What's Changed

### Changed
- **BREAKING**: Minimum Node.js version raised from 20.x to 22.x for compatibility with `@vizzly-testing/honeydiff`

### Fixed
- Removed unused `pngjs` runtime dependency - the plugin now has zero runtime dependencies

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/vitest/v0.0.1...vitest/v0.0.2

## [0.1.0] - 2025-01-24

### Added

- Initial release of Vitest v4 browser mode integration
- Drop-in replacement for Vitest's native `toMatchScreenshot` matcher
- `vizzlyPlugin()` Vite plugin for seamless integration
- Custom matcher implementation via `expect.extend()` in browser context
- Direct HTTP communication from browser to Vizzly server
- Support for both TDD mode (local comparison) and cloud mode (async upload)
- First-class API with `properties`, `threshold`, and `fullPage` options
- `getVizzlyStatus()` helper to check Vizzly availability
- `getVizzlyInfo()` re-export from CLI client
- Comprehensive documentation and examples

### Features

- **True Drop-in Replacement** - Just add plugin, no test changes required
- **Standard Vitest API** - Use native `toMatchScreenshot` syntax
- **TDD Mode** - Interactive local dashboard with instant feedback
- **Cloud Mode** - Team collaboration with visual reviews
- **Clean Options API** - Top-level `properties`, not nested
- **Auto-discovery** - Automatically finds running TDD server
- **Graceful Degradation** - Tests pass when Vizzly not available
- **No Conflicts** - Completely disables Vitest's native system

[0.1.0]: https://github.com/vizzly-testing/cli/releases/tag/vitest-v0.1.0
