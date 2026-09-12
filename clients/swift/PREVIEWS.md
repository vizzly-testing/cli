# SwiftUI `#Preview` capture

Vizzly renders the `#Preview` declarations in your app.

Preview capture is optional. It does not change the `Vizzly` or
`VizzlyXCTest` products used by existing UI tests.

## Requirements

- Xcode 26.6
- Node.js 22+
- An arm64 Mac
- An iOS 17+ Simulator
- A scene-based iOS app
- A shared Xcode scheme that builds the app in Debug

Vizzly supports fixed layouts and portrait or landscape previews. Other preview
traits are not supported yet.

## Install

Add the CLI and Swift plugin to the iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli @vizzly-testing/swift
```

Then add this repository as a Swift Package dependency in Xcode:

```text
https://github.com/vizzly-testing/cli
```

Choose **Exact Version** and enter `0.1.1`.

Add `VizzlyPreviewRuntime` to the app target and choose **Embed & Sign**. Install
it once from the app initializer:

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

Keep writing normal `#Preview` declarations. No other app changes are required.

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

To capture one preview while you work, pass its name:

```bash
pnpm exec vizzly previews --include "Race cockpit · phone"
```

Use a glob to capture a group, such as `--include "Race cockpit*"`. Give each
preview a distinct name if you want to select it on its own.

## Keep capture launches safe

Preview capture launches your app in the selected Simulator. Use a development
Simulator, and skip startup services that should not run during capture:

```swift
init() {
    VizzlyPreviewRuntime.install()

    if !VizzlyPreviewRuntime.isCapturing {
        startProductionServices()
    }
}
```

The app does not receive your Vizzly credentials.

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

## Configure previews

Use your normal `vizzly.config.js`. Keep shared Vizzly settings at the top level
and put Swift preview options under `swiftPreviews`:

```javascript
import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig({
  comparison: {
    threshold: 2,
    minClusterSize: 2,
  },
  swiftPreviews: {
    scheme: 'MyApp',
    include: 'Race cockpit*',
  },
});
```

Command options override `swiftPreviews`:

- `--scheme <scheme>`: shared Xcode scheme
- `--device <udid>`: booted iOS Simulator
- `--configuration <name>`: build configuration
- `--capture-timeout <ms>`: maximum time to wait for each preview
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

If a preview fails, Vizzly keeps the successful screenshots and exits with an
error after the run. Use `manifest.json` to see which previews failed.

Vizzly only replaces output it created. Use `--output` to choose another folder
if `.vizzly/previews` already contains other files.

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

Run `xcodebuild -version`. This release requires Xcode 26.6.

### No previews are found

Make sure the selected scheme builds the app target containing the `#Preview`
declarations in Debug.

### VizzlyPreviewRuntime is not linked and embedded

In the app target's **General** settings, confirm that
`VizzlyPreviewRuntime.framework` appears under **Frameworks, Libraries, and
Embedded Content** with **Embed & Sign** selected. Also confirm the app imports
`VizzlyPreviewRuntime` and calls `VizzlyPreviewRuntime.install()` from its
initializer.

### The output directory is rejected

Choose a new `--output` path, or move the existing directory yourself. Vizzly
will not remove files it cannot prove it created.

### A preview fails

Open that preview in Xcode and fix any missing environment values or objects.
Check that it only uses the supported layout and orientation traits, then run it
again with `--include`.
