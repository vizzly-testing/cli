# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
