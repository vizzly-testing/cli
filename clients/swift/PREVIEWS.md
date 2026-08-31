# Stock `#Preview` capture

The `@vizzly-testing/swift` CLI plugin builds an actual iOS app for an already
booted Simulator, discovers generated `DeveloperToolsSupport.PreviewRegistry`
types in the built Mach-O, and launches the app once per registry.

A small native Swift dylib is compiled for the selected Simulator and injected
only into those capture launches. It intercepts the stock
`DeveloperToolsSupport.Preview` initializer, keeps the original
`@MainActor () -> any View` closure, mounts that view in the active app window,
and writes a PNG. The CLI copies the completed artifacts into the requested
host directory, writes `manifest.json`, and sends each screenshot through the
same Vizzly client used by the other SDKs.

```sh
vizzly previews MyApp.xcodeproj --scheme MyApp
```

Upload routing stays simple:

1. A live local TDD server wins.
2. Otherwise, an available Vizzly token creates and finalizes a cloud build.
3. With neither available, the PNGs and manifest stay local and the command
   tells you how to enable uploads.

For a complete one-off local review, let the TDD command own the server for the
whole capture:

```sh
vizzly tdd run "vizzly previews" --no-open
```

Use `vizzly previews --no-upload` when you deliberately want only the local
artifacts. The manifest records `tdd`, `cloud`, `local-only`, or `disabled` so
automation never has to guess what happened.

The CLI auto-selects a project, shared scheme, or booted iOS Simulator only
when exactly one choice exists. Ambiguous choices are listed and require an
explicit argument instead of relying on heuristics.

The supported cutline is deliberately narrow:

- Xcode 26.6 and Swift 6.3.3
- Debug iOS apps on an arm64 iOS Simulator running iOS 17 or newer
- stock SwiftUI `#Preview` declarations in the app executable or debug dylib
- scene-based app lifecycle
- previews without `PreviewTrait` values
- one fresh app process per preview
- local PNG and manifest output on every successful capture
- local TDD uploads and Vizzly cloud build uploads

The implementation fails closed on another Xcode version because the
interceptor uses a Swift ABI symbol. It also fails when preview traits are
present rather than producing a screenshot that silently differs from Xcode.
It does not use Xcode MCP, `mcpbridge`, Xcode's private preview action, source
rewriting, or a `#VizzlyPreview` macro.
