# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-30

## What's Changed

### Changed
- **BREAKING: Migrated from Puppeteer to Playwright** - The SDK now uses `playwright-core` instead of `puppeteer` for browser automation. This dramatically improves performance and reliability, especially in CI environments. Screenshots now complete in <1 second instead of timing out. If you have any custom browser configurations, you may need to update them for Playwright compatibility.

### Added
- **Enhanced browser pooling with context isolation** - Migrated from tab-based pooling to Playwright's BrowserContext-based pooling, providing proper isolation for parallel workers and preventing timeout issues
- **Improved E2E test coverage** - Added comprehensive SDK integration tests that run in both TDD and cloud modes to ensure reliability across all workflows
- **Modern Chrome browser flags** - Updated to use current browser flags for better screenshot consistency and removed deprecated flags that could cause hangs

### Fixed
- **Critical timeout issues in CI** - Fixed screenshot capture timeouts that were occurring with Puppeteer's new headless mode by switching to Playwright's more robust browser management
- **Plugin registration** - Updated plugin registration to use the standardized `vizzlyPlugin` field in package.json (previously `vizzly.plugin`)
- **Tab recycling logic** - Improved tab cleanup to prevent memory leaks during long test runs

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.11...static-site/v0.1.0

## [0.0.11] - 2026-01-06

## What's Changed

### Added
- Support for array patterns in `include` and `exclude` configuration options, allowing multiple page sections to be filtered without complex regex patterns

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.10...static-site/v0.0.11

## [0.0.10] - 2025-12-22

## What's Changed

### Added
- Screenshot timeout configuration: New `--timeout` option (default: 45 seconds) prevents hanging on slow-loading pages
- Automatic retry logic: Failed screenshots now retry once with a fresh browser tab to recover from timeouts and protocol errors
- Tab recycling: Browser tabs are automatically recycled after 10 uses to prevent memory leaks in long-running screenshot jobs

### Changed
- **CI Performance**: Optimized browser arguments for resource-constrained CI environments (disabled GPU, reduced memory usage, limited V8 heap to 512MB)
- Protocol timeout reduced from 180s to 60s for faster failure detection
- CLI output now uses proper formatting methods for better readability

### Fixed
- Improved reliability in CI environments where resource constraints previously caused timeout spikes and hanging jobs
- Better handling of crashed tabs and protocol errors through automatic retry mechanism

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.9...static-site/v0.0.10

## [0.0.9] - 2025-12-22

## What's Changed

### Added
- **`--dry-run` option** - Preview discovered pages and screenshot count without actually capturing screenshots. Perfect for debugging page discovery and understanding what will be tested.
- **Interactive progress display** - Real-time progress updates with ETA in terminal mode, showing completion percentage and time remaining

### Changed
- **Smart concurrency defaults** - Automatically detects optimal concurrency based on CPU cores (uses half of available cores, minimum 2, maximum 8). No more manual tuning needed!
- **Improved error messages** - Clear, actionable guidance when no TDD server or API token is found, showing both local and cloud workflow options

### Fixed
- **Sitemap index handling** - Properly follows child sitemap references instead of treating sitemap files as pages to screenshot
- **Progress output** - Better handling of errors and completion messages in both interactive (TTY) and CI environments

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.8...static-site/v0.0.9

## [0.0.8] - 2025-12-22

## What's Changed

### Changed
- Refactor to functional tab pool + work queue architecture for improved performance and reliability
  - True tab-level concurrency (max tabs actually means max browser tabs, not max pages)
  - Tab reuse via pooling eliminates create/destroy overhead
  - Task-based processing where each (page, viewport) tuple is independent
  - Better work distribution across concurrent tasks
- Migrate test suite from Vitest to Node.js built-in test runner (22+ required)
- Migrate from ESLint + Prettier to Biome for unified, faster linting and formatting

### Fixed
- Fix cloud mode crash when using `services.get()` API (now uses direct property access)
- Fix accessibility issues in example code (button types, aria-hidden attributes)

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.7...static-site/v0.0.8

## [0.0.7] - 2025-11-30

## What's Changed

### Fixed
- Fixed plugin registration error that occurred when trying to set logger level on frozen output module

### Changed
- **BREAKING**: Minimum Node.js version updated from 20.0.0 to 22.0.0 for honeydiff compatibility

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.6...static-site/v0.0.7

## [0.0.6] - 2025-10-18

## What's Changed

### Changed
- **Breaking: Screenshot naming format updated** - Screenshot names no longer include viewport suffixes (e.g., `@mobile`, `@desktop`). Instead, viewport information is now stored as properties for better organization and compatibility with file system restrictions.
  - **Before:** `blog/post-1@mobile` (could cause validation errors with slashes)
  - **After:** Name: `blog-post-1`, Properties: `{ viewport: 'mobile', viewportWidth: 375, viewportHeight: 667 }`
  - Path separators (`/` and `\`) are now replaced with hyphens for cleaner, more portable names
  - This change improves compatibility with Vizzly's security validation and enables better grouping in the dashboard

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.5...static-site/v0.0.6

## [0.0.5] - 2025-10-18

## What's Changed

### Fixed
- Fixed plugin system compatibility with Zod v4 by updating dependency from `^3.24.1` to `^4.1.12`

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.4...static-site/v0.0.5

## [0.0.4] - 2025-10-12

## What's Changed

### Fixed
- **Fixed CLI options overriding config file values**: Removed default values from Commander options that were preventing `vizzly.config.js` settings from being respected. Now CLI flags like `--full-page`, `--concurrency`, `--headless`, and `--use-sitemap` only override config when explicitly provided
- **Fixed layout/dimension change detection**: Added `failOnLayoutDiff` to properly detect when screenshots have different dimensions, preventing silent failures in visual comparisons
- Added comprehensive tests for CLI option parsing and config merging behavior

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.3...static-site/v0.0.4

## [0.0.3] - 2025-10-11

## What's Changed

### Changed
- Relaxed peer dependency requirement for `@vizzly-testing/cli` from `^0.9.0` to `>=0.9.0` to prevent npm installation conflicts with newer CLI versions (0.10.x and higher)

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.2...static-site/v0.0.3

## [0.0.2] - 2025-10-11

# Release v0.0.2

## What's Changed

### Added
- **Initial SDK release** - Comprehensive SDK for static site generators (Gatsby, Astro, Jekyll, Next.js, etc.) with 63 test suite
- **CLI command** - `vizzly static-site` command for capturing screenshots from static site builds
- **Auto page discovery** - Automatic page detection via sitemap.xml and HTML file scanning
- **Pattern-based interaction hooks** - Glob-like pattern syntax (e.g., `/blog/*`, `/docs/**`) for page-specific interactions
- **Flexible configuration** - Support for `vizzly.config.js` and separate `vizzly.static-site.js` interactions file
- **Custom viewports** - Define viewport presets and per-page viewport overrides
- **Concurrent processing** - Configurable parallel page processing for faster screenshot capture
- **Page filtering** - Include/exclude patterns for selective page capture
- **Zod validation** - Plugin config schema with automatic generation in `vizzly init`
- **ESM module support** - Properly configured for ES modules usage
- **`staticSite()` helper** - Convenience function for config file usage

### Changed
- **URL generation** - Fixed to use `filePath` for accurate page URLs instead of sitemap-only paths

### Fixed
- **ESLint configuration** - Added standalone ESLint config to fix CI release workflow
- **Unused imports** - Removed unused imports and variables for cleaner code
- **Browser context** - Improved Puppeteer browser context handling

**Full Changelog**: https://github.com/vizzly-testing/cli/compare/static-site/v0.0.1...static-site/v0.0.2
