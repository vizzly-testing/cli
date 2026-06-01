# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-01

## What's Changed

### Added
- Added automatic screenshot metadata for Vitest captures, including the current
  page URL, browser, viewport, viewport width, and viewport height.
- Added support for Vitest and Playwright screenshot capture options such as
  `animations`, `caret`, `mask`, `maskColor`, `omitBackground`, `scale`, and
  `timeout`.
- Added `minClusterSize` and `failOnDiff` options to `toMatchScreenshot`.
- Added support for calling `toMatchScreenshot` with options only, without a
  screenshot name.

### Changed
- Visual diffs are now recorded without failing the assertion unless
  `failOnDiff` is enabled by the screenshot option, environment, or Vizzly TDD
  server configuration.
- New screenshot baselines now pass after being created, so first-time captures
  do not fail the Vitest run.
- `vizzlyPlugin` is now configuration-free; pass screenshot behavior through
  `toMatchScreenshot` options instead.
- Package scripts and docs now use `pnpm` commands for installation and test
  workflows.

### Fixed
- Fixed element screenshots so `fullPage` is not passed to element capture or
  recorded as full-page metadata.
- Fixed Vizzly-only options so they are sent to Vizzly as comparison metadata
  instead of being forwarded to browser screenshot capture.
- Fixed reserved runtime metadata such as framework, Vitest marker, URL, and
  browser so user-provided properties cannot accidentally overwrite the current
  browser session values.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/vitest/v0.1.1...vitest/v0.2.0

## [0.1.1] - 2026-01-15

## What's Changed

### Fixed
- Fixed compatibility with Vizzly CLI v0.23.0+ by updating status value handling from `passed`/`failed` to `match`/`diff`
- Added support for `baseline-updated` status to properly handle baseline updates in TDD mode

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/vitest/v0.1.0...vitest/v0.1.1

## [0.1.0] - 2026-01-07

## What's Changed

### Changed
- **Migrated to Biome for linting and formatting** - Replaced ESLint + Prettier with Biome for faster, unified code quality checks. Updated all npm scripts (`lint`, `format`, `check`) to use Biome tooling.

### Performance
- **Improved screenshot upload performance** - Added explicit `type: 'file-path'` field when sending screenshots to the Vizzly server, enabling O(1) type detection instead of content sniffing. This reduces server-side processing overhead for every screenshot.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/vitest/v0.0.3...vitest/v0.1.0

## [0.0.3] - 2025-11-29

## What's Changed

### Fixed
- Fixed `setupFiles` duplication bug where user-provided setup files would run twice due to incorrect config merging in the Vitest plugin

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/vitest/v0.0.2...vitest/v0.0.3

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
