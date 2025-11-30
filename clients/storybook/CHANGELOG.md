# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
