# Vizzly Swift SDK

Vizzly brings visual testing to Swift in two ways:

| Workflow | Use it for | Runs on |
| --- | --- | --- |
| SwiftUI previews | Render the stock `#Preview` declarations already in your app | arm64 iOS Simulator |
| XCTest screenshots | Capture an app or element during a UI test | iOS or macOS |

Both workflows send screenshots to the same local TDD and cloud review tools.
You can use either one or both.

## SwiftUI previews

Install the CLI and preview plugin in your iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli @vizzly-testing/swift
```

Boot an iOS Simulator, then run:

```bash
pnpm exec vizzly previews
```

Vizzly builds the app, finds its existing `#Preview` declarations, renders each
one in the Simulator, and writes PNGs to `.vizzly/previews`. It does not require
a Vizzly macro or changes to your app target.

See [PREVIEWS.md](PREVIEWS.md) for requirements, configuration, CI, and
troubleshooting.

## XCTest screenshots

Add this repository as a Swift Package dependency:

```text
https://github.com/vizzly-testing/cli
```

Add the `VizzlyXCTest` product to your UI test target. Then capture the app or a
single element from a test:

```swift
import XCTest
import Vizzly
import VizzlyXCTest

final class HomeScreenTests: XCTestCase {
    func testHomeScreen() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 5))
        app.vizzlyScreenshot(name: "home")
    }
}
```

Start a local review session before running the test:

```bash
pnpm exec vizzly tdd start --open
```

See [QUICKSTART.md](QUICKSTART.md) for the shortest setup path and
[INTEGRATION.md](INTEGRATION.md) for options and CI.

## Support

| Capability | XCTest SDK | Preview capture |
| --- | --- | --- |
| iOS | iOS 13+ | iOS 17+ Simulator |
| macOS | macOS 10.15+ | Not supported |
| Local TDD | Yes | Yes |
| Cloud builds | Yes | Yes |
| Exact Xcode requirement | No | Xcode 26.6 |
| SwiftUI preview traits | Not applicable | Not yet supported |

Preview capture intentionally has a narrow compatibility range because it uses
the preview ABI shipped with Xcode. The command checks the Xcode version and
stops instead of producing screenshots with unknown behavior.

## More

- [XCTest quick start](QUICKSTART.md)
- [XCTest integration guide](INTEGRATION.md)
- [SwiftUI preview guide](PREVIEWS.md)
- [Example UI test](Example/ExampleUITests.swift)
- [Changelog](CHANGELOG.md)
