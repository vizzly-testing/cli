# Stock `#Preview` capture spike

This spike adds a `vizzly previews` CLI extension without inventing a second
preview declaration API. It builds the selected Debug app for an already
booted iOS Simulator, finds the generated `DeveloperToolsSupport.PreviewRegistry`
types in the built Mach-O, and launches the real app once per registry.

A small Swift dylib is injected only into those capture launches. It intercepts
the stock `DeveloperToolsSupport.Preview` initializer, keeps the original
`@MainActor () -> any View` closure, mounts that view in the app window, and
writes a PNG. The CLI copies each PNG to the requested host directory and writes
`manifest.json`.

```sh
vizzly previews MyApp.xcodeproj \
  --scheme MyApp \
  --device B40B976E-CD70-45F2-830C-48E8ED9B7EE7 \
  --output .vizzly/previews
```

The current cutline is deliberately narrow:

- Xcode 26.6 and Swift 6.3.3
- Debug iOS apps on an arm64 iOS Simulator
- SwiftUI `#Preview` declarations
- one fresh app process per preview
- local PNG and manifest output; Vizzly upload is the next integration step

The implementation fails closed on another Xcode version because the
interceptor uses a Swift ABI symbol. It does not use Xcode MCP, `mcpbridge`,
Xcode's private preview action, source rewriting, or a `#VizzlyPreview` macro.
