# Vizzly Swift SDK - Quick Start

Get visual regression testing in your iOS app in 5 minutes.

## 1. Install Vizzly CLI

```bash
pnpm install -g @vizzly-testing/cli
```

## 2. Add Swift SDK to Xcode

1. Open your iOS project in Xcode
2. **File → Add Package Dependencies**
3. Paste: `https://github.com/vizzly-testing/cli`
4. Add the `VizzlyXCTest` product to your **UI Test target**

## 3. Start TDD Server

In your iOS project directory:

```bash
vizzly tdd start
```

## 4. Write a Visual Test

```swift
import XCTest
import Vizzly
import VizzlyXCTest

class MyAppUITests: XCTestCase {
    let app = XCUIApplication()

    func testHomeScreen() {
        app.launch()

        // Wait for screen to load
        let title = app.navigationBars["Home"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))

        // 📸 Capture screenshot
        app.vizzlyScreenshot(name: "home-screen")
    }
}
```

## 5. Run Tests

Press `Cmd+U` in Xcode, or:

```bash
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

## 6. Review Results

Open dashboard: **http://localhost:47392/dashboard**

- ✅ Green = Screenshots match baselines
- ⚠️ Yellow = Visual differences detected
- 🆕 Blue = New screenshots (first run)

Click any screenshot to see side-by-side comparison and approve/reject changes.

## Next Steps

- **More Examples**: See [Example/ExampleUITests.swift](Example/ExampleUITests.swift)
- **Full Docs**: Read [README.md](README.md)
- **Integration Guide**: Check [INTEGRATION.md](INTEGRATION.md) for CI/CD, dark mode, multiple devices
- **Website**: https://vizzly.dev

## Common API Usage

### Screenshot with Properties

```swift
app.vizzlyScreenshot(
    name: "checkout-flow",
    properties: [
        "theme": "dark",
        "user": "premium"
    ]
)
```

### Screenshot an Element

```swift
let button = app.buttons["Submit"]
button.vizzlyScreenshot(name: "submit-button")
```

### Custom Threshold

```swift
// Allow a higher comparison threshold for animated content
app.vizzlyScreenshot(
    name: "animated-view",
    threshold: 5
)
```

## Questions?

- **Docs**: https://docs.vizzly.dev
- **GitHub**: https://github.com/vizzly-testing/cli
- **Support**: support@vizzly.dev
