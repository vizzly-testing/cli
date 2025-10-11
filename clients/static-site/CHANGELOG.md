# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
