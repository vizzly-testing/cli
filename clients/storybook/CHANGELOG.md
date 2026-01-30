# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-01-30

## What's Changed

### Changed
- **BREAKING:** Migrated from Puppeteer to Playwright for browser automation
  - Replace `puppeteer` dependency with `playwright-core`
  - This significantly improves screenshot performance and reliability in CI environments
  - Screenshots now complete in <1 second instead of timing out after 60+ seconds
  - **~47x performance improvement** for Storybook navigation (94s → 2s for 10 screenshots) thanks to client-side story navigation
  - If you have custom browser configurations, you may need to update them for Playwright compatibility

### Fixed
- Fixed critical screenshot timeout issues in CI environments caused by Puppeteer's parallel capture limitations
- Improved browser context isolation for parallel workers, preventing race conditions
- Removed deprecated Chrome flags that caused hangs and inconsistent behavior
- Added screenshot consistency flags (`--force-color-profile=srgb`, `--hide-scrollbars`) for more reliable visual comparisons

### Added
- Client-side navigation for Storybook stories using Storybook's internal event system
  - First story per tab uses full page load to initialize Storybook
  - Subsequent stories use fast client-side navigation with `storyRendered` event handling
- Tasks are now sorted by viewport to minimize resize operations and improve performance
- Support for `vizzlyPlugin` field in package.json for plugin registration (replacing nested `vizzly.plugin` format)

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/storybook/v0.2.0...storybook/v0.3.0

## [0.2.0] - 2026-01-29

# v0.2.0

## What's Changed

### Added
- **Tab pool architecture** - Reuses browser tabs instead of creating/destroying per story for significantly better performance
- **Tab recycling** - Automatically closes and recreates tabs after 10 uses to prevent memory leaks
- **Automatic retry** - On timeout/crash, closes bad tab and retries with a fresh one
- **Tab state reset** - Clears cookies/localStorage between uses to ensure clean test state
- **Progress tracking** - Shows ETA and completion percentage in TTY mode
- **CI-optimized browser flags** - Same hardened browser arguments as static-site SDK for improved stability

### Fixed
- Fixed `services.get is not a function` bug by rebuilding dist after source changes
- Fixed timeout issues in CI environments through robust browser management

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/storybook/v0.1.3...storybook/v0.2.0

## [0.1.3] - 2026-01-28

## What's Changed

### Changed
- Migrated test suite from Vitest to Node.js built-in test runner (`node:test`) for better performance and reduced dependencies
- Replaced ESLint and Prettier with Biome for unified, faster linting and formatting
- Upgraded minimum Node.js version requirement from 20.0.0 to 22.0.0
- Improved test coverage from 87% to 99%

### Fixed
- Fixed `services.get()` calls to use direct property access, resolving "services.get is not a function" errors when using the plugin in cloud mode
- Added comprehensive E2E tests that work with both `vizzly tdd run` (local TDD mode) and `vizzly run` (cloud mode)
- Improved Puppeteer performance in CI environments with optimized arguments and timeout handling

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/storybook/v0.1.2...storybook/v0.1.3

## [0.1.2] - 2025-11-30

## What's Changed

### Changed
- **BREAKING**: Configuration file migration - plugin now uses `storybook` section in `vizzly.config.js` instead of standalone `vizzly-storybook.config.js` file. Run `vizzly init` to generate updated config structure.
- **BREAKING**: Minimum Node.js version increased to 22+ (for honeydiff compatibility)
- Removed `cosmiconfig` dependency in favor of unified Vizzly config system
- Updated default viewports: now includes both mobile (375x667) and desktop (1920x1080)
- Updated README with new configuration format and examples

### Fixed
- Plugin registration error with frozen output module (#92)

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/storybook/v0.1.1...storybook/v0.1.2

## [0.1.1] - 2025-10-11

## What's Changed

### Fixed
- Fixed npm peer dependency conflicts by relaxing CLI version requirement from `^0.9.0` to `>=0.9.0`. This resolves installation failures when using CLI version 0.10.x or higher while still maintaining the minimum required version of 0.9.0.

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/storybook/v0.1.0...storybook/v0.1.1

## [0.1.0] - 2025-10-08

## What's Changed

Release v0.1.0

See the full diff for detailed changes.

## [0.0.2] - 2025-10-08

## What's Changed

Release v0.0.2

See the full diff for detailed changes.

## [1.0.0] - 2025-10-06

### Added
- Initial release of @vizzly-testing/storybook plugin
- Auto-discovery of Storybook stories from index.json
- Support for Storybook v6, v7, and v8
- Multi-viewport screenshot capture
- Global and per-story configuration
- Interaction hooks (beforeScreenshot)
- Pattern-based story filtering (include/exclude)
- Parallel story processing with concurrency control
- CLI command registration via plugin system
- Programmatic API for advanced usage
- Comprehensive test coverage
