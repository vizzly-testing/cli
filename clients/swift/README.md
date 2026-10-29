# Vizzly Swift SDK

Capture SwiftUI previews or XCTest screenshots and review changes with Vizzly.
You can review either one locally or in the cloud.

| Workflow | Use it for | Requirements |
| --- | --- | --- |
| [SwiftUI previews](PREVIEWS.md) | Render your app's `#Preview` declarations. | Xcode 26.5+, arm64 Mac, iOS 17+ Simulator. |
| [XCTest screenshots](QUICKSTART.md) | Capture an app or element during a UI test. | iOS 13+ or macOS 10.15+. |

## XCTest screenshots

Add `https://github.com/vizzly-testing/cli` as a Swift Package dependency in
Xcode. Choose **Exact Version** `0.1.1` and add `VizzlyXCTest` to your UI test
target.

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

Start `pnpm exec vizzly tdd start --open`, then run your UI test.
See the [quick start](QUICKSTART.md) for CLI setup and the
[integration guide](INTEGRATION.md) for options and CI.

## SwiftUI previews

```bash
pnpm add --save-dev @vizzly-testing/cli @vizzly-testing/swift
```

Add the same Swift package, choose **Exact Version** `0.1.1`, and add
`VizzlyPreviewRuntime` to the app target with **Embed & Sign**. Call
`VizzlyPreviewRuntime.install()` once in the app initializer.

Boot an iOS Simulator and run `pnpm exec vizzly previews`. Screenshots go in
`.vizzly/previews`. Fixed layouts and portrait or landscape previews work.
Other preview traits and macOS preview capture aren't supported yet.

See the [preview guide](PREVIEWS.md) for the full setup, CI, and troubleshooting.
If you only need UI tests, keep `VizzlyXCTest` on the test target and skip
the preview runtime.

## More

- [Example UI test](Example/ExampleUITests.swift)
- [Changelog](CHANGELOG.md)
