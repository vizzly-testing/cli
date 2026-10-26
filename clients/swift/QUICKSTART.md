# XCTest quick start

Add a screenshot to an iOS UI test and review it locally with Vizzly.

## 1. Install the CLI

From your iOS project:

```bash
pnpm add --save-dev @vizzly-testing/cli
```

## 2. Add the Swift package

In Xcode:

1. Choose **File → Add Package Dependencies**.
2. Enter `https://github.com/vizzly-testing/cli`.
3. Choose **Exact Version** and enter `0.1.1`.
4. Add `VizzlyXCTest` to the UI test target.

## 3. Start local TDD

```bash
pnpm exec vizzly tdd start --open
```

Open the dashboard URL Vizzly prints. Leave the server running while you test.

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

To start the server, run tests, and stop it in one command:

```bash
pnpm exec vizzly tdd run \
  "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 17 Pro'" \
  --no-open
```

Vizzly writes the static report to `.vizzly/report/index.html`.

## Next steps

- [XCTest options and CI](INTEGRATION.md)
- [SwiftUI preview capture](PREVIEWS.md)
- [Complete UI test example](Example/ExampleUITests.swift)
