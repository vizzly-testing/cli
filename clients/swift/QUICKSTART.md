# XCTest quick start

This guide gets one iOS UI test into local Vizzly TDD.

## 1. Install the CLI

From your iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli
```

## 2. Add the Swift package

In Xcode:

1. Choose **File → Add Package Dependencies**.
2. Enter `https://github.com/vizzly-testing/cli`.
3. Add `VizzlyXCTest` to the UI test target.

## 3. Start local TDD

```bash
pnpm exec vizzly tdd start --open
```

The command prints the dashboard URL. Keep it running while the UI test runs.

## 4. Capture a screenshot

```swift
import XCTest
import Vizzly
import VizzlyXCTest

final class HomeScreenTests: XCTestCase {
    func testHomeScreen() {
        let app = XCUIApplication()
        app.launch()

        let title = app.navigationBars["Home"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))

        app.vizzlyScreenshot(name: "home")
    }
}
```

Run the test with `Cmd+U` or `xcodebuild`. The screenshot appears in the local
dashboard.

For a one-off run, let Vizzly own the server lifecycle:

```bash
pnpm exec vizzly tdd run \
  "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 17 Pro'" \
  --no-open
```

Vizzly writes the static report to `.vizzly/report/index.html`.

## Next steps

- [XCTest options and CI](INTEGRATION.md)
- [Stock SwiftUI preview capture](PREVIEWS.md)
- [Complete UI test example](Example/ExampleUITests.swift)
