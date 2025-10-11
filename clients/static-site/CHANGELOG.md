# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Static Site plugin for Vizzly
- Automatic page discovery from sitemap.xml
- Direct HTML file scanning for page discovery
- Optional `vizzly.static-site.js` file for defining page interactions and overrides
- Pattern-based interaction hooks
- Support for multiple viewports
- Auto-detection of TDD vs Run mode
- Unified configuration in vizzly.config.js (supports JSON, YAML, TOML, or JS formats)
- Support for all major static site generators (Gatsby, Astro, Jekyll, Next.js, etc.)
- Zod schema validation for configuration
- Pattern-based page configuration matching
- Named interaction references in page configs

### Features
- `vizzly static-site <path>` CLI command
- Sitemap.xml parsing with fast-xml-parser
- Puppeteer-based browser automation
- Concurrent page processing with configurable concurrency
- Integration with Vizzly client SDK
- Auto-discovery of interactions file in project root
- Support for `.mjs` variant of interactions file
- Comprehensive documentation and examples
