# SwiftUI `#Preview` capture

Vizzly renders the stock `#Preview` declarations already in your app. You do
not need a Vizzly macro, a catalog, or a second set of preview definitions.

## Requirements

- Xcode 26.6
- Node.js 22+
- An arm64 Mac
- An iOS 17+ Simulator
- A scene-based iOS app
- A shared Xcode scheme that builds the app in Debug

The current renderer supports fixed layouts and portrait or landscape
orientation traits. Other traits, including `sizeThatFitsLayout`, custom
preview modifiers, and Assistive Access, fail that preview with a clear entry
in the capture manifest.

## Install

Add the CLI and Swift plugin to the iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli @vizzly-testing/swift@beta
```

Then add this repository as a Swift Package dependency in Xcode:

```text
https://github.com/vizzly-testing/cli
```

For the beta, choose **Exact Version** and enter `0.1.1-beta.0`. This repository
also contains the Vizzly CLI, so a broad version rule can select an unrelated
CLI release tag.

Add the dynamic `VizzlyPreviewRuntime` product to the app target and choose
**Embed & Sign**. Install it once from the app initializer:

```swift
import SwiftUI
import VizzlyPreviewRuntime

@main
struct MyApp: App {
    init() {
        VizzlyPreviewRuntime.install()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

That is the complete app integration. Keep writing normal `#Preview`
declarations. The runtime does nothing during an ordinary app launch and
compiles to a no-op outside the iOS Simulator.

## Keep capture launches safe

Vizzly launches the built app once and renders previews in that process. If a
preview crashes the process, Vizzly records the failure and relaunches the app
with the remaining previews. Your app initializer and some scene lifecycle
code can run before Vizzly replaces the app window, including after a recovery
launch. The process has the same Simulator data and network access as an
ordinary app launch.

Preview roots are replaced between captures, but they share one process. Keep
preview setup self-contained and avoid relying on mutable global state left by
another preview.

Use a dedicated development Simulator. Keep destructive startup work out of app
initializers, and gate services that should not run during capture:

```swift
init() {
    VizzlyPreviewRuntime.install()

    if !VizzlyPreviewRuntime.isCapturing {
        startProductionServices()
    }
}
```

The CLI only adds preview capture instructions and output filenames to the
launched app environment. It does not pass `VIZZLY_TOKEN` or other Vizzly
credentials into the app process.

## Capture previews

Boot an iOS Simulator, then run this from a directory containing one Xcode
project or workspace:

```bash
pnpm exec vizzly previews
```

Vizzly auto-selects a project, shared scheme, or booted Simulator only when
there is exactly one choice. Pass ambiguous values explicitly:

```bash
pnpm exec vizzly previews MyApp.xcworkspace \
  --scheme MyApp \
  --device B40B976E-CD70-45F2-830C-48E8ED9B7EE7
```

Use `xcrun simctl list devices booted` to find the Simulator UDID.

The command uses Xcode's normal DerivedData location, so later runs can reuse
the project's existing build products instead of starting with a clean build.

During local iteration, select one named preview instead of rendering the whole
app:

```bash
pnpm exec vizzly previews --include "Race cockpit · phone"
```

`--include` accepts a glob when a small group is useful, such as
`--include "Race cockpit*"`. Vizzly resolves display names and renders only the
matches in the same app launch. Give previews distinct names when you want to
select them individually.

## Local review

For one capture and report:

```bash
pnpm exec vizzly tdd run "pnpm exec vizzly previews" --no-open
```

If `vizzly tdd start` is already running in this project, plain
`vizzly previews` finds its `.vizzly/server.json` file and sends screenshots to
that server.

## Cloud upload

Set `VIZZLY_TOKEN` and run the same command. The plugin creates a cloud build,
uploads every preview, finalizes the build, and prints the result URL.

```bash
VIZZLY_TOKEN=... pnpm exec vizzly previews --scheme MyApp
```

Upload routing is predictable:

1. A live project-local TDD server wins.
2. Otherwise, `VIZZLY_TOKEN` or `apiKey` creates a cloud build.
3. Without either one, screenshots stay local.

Pass `--no-upload` when local artifacts are the intended result.

## Configuration

Put shared defaults under `swiftPreviews` in `vizzly.config.js`:

```javascript
import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig({
  swiftPreviews: {
    scheme: 'MyApp',
    device: 'B40B976E-CD70-45F2-830C-48E8ED9B7EE7',
    configuration: 'Debug',
    captureTimeout: 30_000,
    include: 'Race cockpit*',
    output: '.vizzly/previews',
    upload: true,
  },
});
```

Command options override the config file:

- `--scheme <scheme>`: shared Xcode scheme
- `--device <udid>`: booted iOS Simulator
- `--configuration <name>`: build configuration
- `--capture-timeout <ms>`: limit for each preview launch
- `--include <pattern>`: include preview display names matching a glob
- `--output <path>`: PNG and manifest directory
- `--no-upload`: keep artifacts local
- `--json`: print the manifest as JSON

## Output

The default output is `.vizzly/previews`:

```text
.vizzly/previews/
├── 001-card-dark.png
├── 002-stateful-counter.png
└── manifest.json
```

The manifest records the Xcode version, scheme, Simulator, preview names,
image dimensions, hashes, capture failures, and upload result. `upload.mode` is
one of `tdd`, `cloud`, `local-only`, or `disabled`.

Vizzly keeps rendering after one preview fails or times out. A preview that
throws a supported error is skipped in place. A preview that crashes or hangs
the app is recorded before Vizzly relaunches with the remaining work. Successful
captures are saved and uploaded, and an incomplete run exits with a non-zero
status so CI cannot mistake it for a complete one.

A successful rerun replaces an output directory previously created by Vizzly.
If the directory has missing, changed, or unrelated files, Vizzly refuses to
delete it.

## CI

Preview CI needs an arm64 macOS runner with Xcode 26.6 and a booted iOS
Simulator. Keep the scheme shared in source control.

```yaml
- name: Boot Simulator
  run: |
    xcrun simctl boot "$VIZZLY_SIMULATOR_UDID"
    xcrun simctl bootstatus "$VIZZLY_SIMULATOR_UDID" -b

- name: Capture SwiftUI previews
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
    VIZZLY_SIMULATOR_UDID: ${{ vars.VIZZLY_SIMULATOR_UDID }}
  run: |
    pnpm exec vizzly previews \
      MyApp.xcodeproj \
      --scheme MyApp \
      --device "$VIZZLY_SIMULATOR_UDID"
```

`simctl bootstatus` waits for a concrete Simulator boot event; no fixed delay is
needed.

## Troubleshooting

### More than one project, scheme, or Simulator is available

Pass the project path, `--scheme`, or `--device`. Vizzly lists the ambiguous
choices in the error.

### No shared scheme is available

In Xcode, choose **Product → Scheme → Manage Schemes**, mark the app scheme as
shared, and commit the scheme file.

### No booted Simulator is found

Boot one from Xcode or Simulator. Confirm it appears under:

```bash
xcrun simctl list devices booted
```

### Xcode is unsupported

Run `xcodebuild -version`. This release supports exactly Xcode 26.6 because the
renderer depends on that release's Swift preview ABI.

### No previews are found

Make sure the selected scheme builds the app target containing the `#Preview`
declarations in Debug. Vizzly looks in the app executable and debug dylibs.

### VizzlyPreviewRuntime is not linked and embedded

In the app target's **General** settings, confirm that
`VizzlyPreviewRuntime.framework` appears under **Frameworks, Libraries, and
Embedded Content** with **Embed & Sign** selected. Also confirm the app imports
`VizzlyPreviewRuntime` and calls `VizzlyPreviewRuntime.install()` from its
initializer.

### The output directory is rejected

Choose a new `--output` path, or move the existing directory yourself. Vizzly
will not remove files it cannot prove it created.

### One preview crashes

Open `manifest.json` and check the failure's `registryType`. It contains the
source filename and line used by the generated preview registry. A crash here
usually means the preview body is missing an environment object or another
dependency it also needs in Xcode's canvas.

## How it works

The CLI builds the real app for the selected Simulator, finds generated
`DeveloperToolsSupport.PreviewRegistry` types in the Mach-O, and launches one
fresh app process per preview. The normally linked native runtime captures the
preview body, mounts it in the app window, and writes a PNG.

This path does not use Xcode MCP, `mcpbridge`, private Xcode actions, or source
rewriting. It also does not inject a library, copy code into the built app,
change the app's signature, or pass credentials to the app process. Xcode owns
the runtime's build, embedding, and signing like any other Swift Package
dependency. The exact Xcode check is the safety boundary around the private
Swift ABI used for preview discovery.
