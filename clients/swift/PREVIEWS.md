# SwiftUI preview capture

Take screenshots of your app's `#Preview` declarations and compare them
with Vizzly.

## Requirements

- Xcode 26.5+ and an arm64 Mac
- Node.js 22.18+ on Node 22, or Node.js 24+
- A booted iOS 17+ Simulator
- A scene-based iOS app with a shared scheme that builds in Debug

Fixed layouts and portrait or landscape previews work. Other preview traits
aren't supported yet. Preview capture uses `VizzlyPreviewRuntime`; existing
`Vizzly` and `VizzlyXCTest` integrations stay the same.

Vizzly accepts Xcode 26.5 and newer and checks the active iOS Simulator SDK for
the SwiftUI initializer its runtime uses. Preview capture has been verified
with Xcode 26.6 and 27.1.

## Install

From your iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli @vizzly-testing/swift
```

In Xcode, add `https://github.com/vizzly-testing/cli` as a Swift Package
dependency. Choose **Exact Version** `0.1.1`, then add `VizzlyPreviewRuntime`
to the app target with **Embed & Sign**.

Install the runtime once in the app initializer:

```swift
import SwiftUI
import VizzlyPreviewRuntime

@main
struct MyApp: App {
    init() {
        VizzlyPreviewRuntime.install()
    }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
```

## Capture previews

Boot an iOS Simulator, then run:

```bash
pnpm exec vizzly previews
```

Vizzly prefers a single workspace, otherwise a single project. It picks the
only app scheme and booted iOS Simulator automatically. When a choice is
ambiguous, pass the path, `--scheme`, or `--device`:

```bash
pnpm exec vizzly previews MyApp.xcworkspace \
  --scheme MyApp \
  --device B40B976E-CD70-45F2-830C-48E8ED9B7EE7
```

Find the Simulator UDID with `xcrun simctl list devices booted`. Use `--include`
with a preview name or glob to capture just the previews you want:

```bash
pnpm exec vizzly previews --include "Race cockpit*"
```

Give each preview a unique name so you can select it on its own.

Capture launches your app in the selected Simulator. Use a development
Simulator and skip startup services that shouldn't run during capture:

```swift
init() {
    VizzlyPreviewRuntime.install()

    if !VizzlyPreviewRuntime.isCapturing {
        startProductionServices()
    }
}
```

The app doesn't receive your Vizzly credentials.

## Review locally or in the cloud

For one capture and a local report:

```bash
pnpm exec vizzly tdd run "pnpm exec vizzly previews" --no-open
```

If a TDD server is running in this project, previews go there. Otherwise, set
`VIZZLY_TOKEN` or `apiKey` to create a cloud build and upload them:

```bash
VIZZLY_TOKEN=... pnpm exec vizzly previews --scheme MyApp
```

Vizzly prints the cloud build URL when it finishes. Without a server or token,
screenshots stay local. You can also pass `--no-upload` to keep them local.

## Configuration

Put preview options under `swiftPreviews` in `vizzly.config.js`:

```javascript
import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig({
  comparison: { threshold: 2, minClusterSize: 2 },
  swiftPreviews: {
    scheme: 'MyApp',
    include: 'Race cockpit*',
  },
});
```

Command options override your config:

| Option | What it does |
| --- | --- |
| `--scheme <scheme>` | Shared Xcode scheme. |
| `--device <udid>` | Booted iOS Simulator. |
| `--configuration <name>` | Build configuration. |
| `--capture-timeout <ms>` | How long to wait for each preview. |
| `--include <pattern>` | Match preview display names with a glob. |
| `--output <path>` | PNG and manifest folder. |
| `--no-upload` | Keep files local. |
| `--json` | Print the manifest as JSON. |

Screenshots and `manifest.json` go in `.vizzly/previews` by default. If a
preview fails, Vizzly keeps successful captures and exits with an error after
the run. Check the manifest for failures.

Vizzly only replaces files it created. Choose another `--output` folder if
the default already contains other files.

## CI

Use an arm64 macOS runner with Xcode 26.5+, a shared scheme in source control,
and a booted iOS Simulator:

```yaml
- name: Boot Simulator
  env:
    VIZZLY_SIMULATOR_UDID: ${{ vars.VIZZLY_SIMULATOR_UDID }}
  run: |
    xcrun simctl boot "$VIZZLY_SIMULATOR_UDID"
    xcrun simctl bootstatus "$VIZZLY_SIMULATOR_UDID" -b

- name: Capture SwiftUI previews
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
    VIZZLY_SIMULATOR_UDID: ${{ vars.VIZZLY_SIMULATOR_UDID }}
  run: |
    pnpm exec vizzly previews MyApp.xcodeproj \
      --scheme MyApp --device "$VIZZLY_SIMULATOR_UDID"
```

## Troubleshooting

- **Multiple projects, schemes, or Simulators:** Pass the project path,
  `--scheme`, or `--device`. The error lists the choices.
- **No shared scheme:** In Xcode's **Product → Scheme → Manage Schemes**, mark
  the app scheme as shared and commit the scheme file.
- **No booted Simulator:** Boot one and check `xcrun simctl list devices booted`.
- **Xcode too old:** Preview capture requires Xcode 26.5 or newer. Select a
  newer installation with `DEVELOPER_DIR` and check `xcodebuild -version`.
- **Unsupported preview ABI:** The active iOS Simulator SDK is missing the
  SwiftUI initializer Vizzly uses. Update the Vizzly Swift SDK or set
  `DEVELOPER_DIR` to a compatible Xcode installation. Check the selected version
  with `xcodebuild -version`.
- **No previews:** Make sure the scheme builds the app target containing
  `#Preview` declarations in Debug.
- **Runtime isn't linked:** Check that `VizzlyPreviewRuntime.framework` is in
  the app target's **Frameworks, Libraries, and Embedded Content**, set to
  **Embed & Sign**. Import the module and call `install()` in the initializer.
- **Output folder rejected:** Choose a new path or move the existing folder.
  Vizzly won't delete files it didn't create.
- **A preview fails:** Open it in Xcode, check missing environment values and
  unsupported traits, then retry with `--include`.
