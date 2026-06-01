# Vizzly Swift SDK Changelog

All notable changes to the Vizzly Swift SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-01

### What's Changed

This is the first tagged release of the Vizzly Swift SDK. It gives iOS and
macOS test suites a small Swift Package Manager client for sending screenshots
to Vizzly from XCTest, without needing each app to hand-roll the HTTP payloads
or local TDD server discovery.

### Added

- Added the `Vizzly` Swift package with two library products:
  - `Vizzly`, the core screenshot upload client.
  - `VizzlyXCTest`, convenience helpers for `XCTestCase`, `XCUIApplication`,
    and `XCUIElement`.
- Added local TDD server discovery through `VIZZLY_SERVER_URL`,
  project-local `.vizzly/server.json`, global `.vizzly/server.json`, and the
  default TDD port fallback.
- Added screenshot uploads with base64 PNG payloads, `buildId` support,
  request timeouts, and graceful disabling after connection or server failures.
- Added XCTest-friendly metadata capture for platform, device, OS, viewport,
  and element type while still letting user-provided `properties` win.
- Added comparison options for `threshold`, `minClusterSize`, and `fullPage`
  so Swift screenshots use the same option contract as the other SDKs.
- Added `failOnDiff` support from explicit client configuration,
  `VIZZLY_FAIL_ON_DIFF`, and discovered TDD server settings.

### Tested

- Added Swift unit coverage for payload shape, comparison options, build IDs,
  metadata merging, disabled clients, and client state.
- Added Swift SDK E2E coverage that runs through the real local Vizzly TDD
  server and verifies screenshots can be uploaded, repeated, and matched.
- The release workflow builds and tests the Swift package before tagging the
  release.
