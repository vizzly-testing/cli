# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
