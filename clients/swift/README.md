# Vizzly Swift SDK

A lightweight Swift SDK for capturing screenshots from iOS and macOS UI tests and sending them to Vizzly for visual regression testing.

Unlike tools that render components in isolation, Vizzly captures screenshots directly from your **real UI tests**. Test your actual app, get visual regression testing for free.

## Features

- **Zero Configuration** - Auto-discovers Vizzly TDD server
- **Native XCTest Integration** - Simple extensions for `XCUIApplication` and `XCUIElement`
- **iOS & macOS Support** - Works on both platforms
- **Automatic Metadata** - Captures device, screen size, and platform info
- **TDD Mode** - Local visual testing with instant feedback
- **Cloud Mode** - Team collaboration via Vizzly dashboard
- **Graceful Degradation** - Tests pass even if Vizzly is unavailable

## Installation

### Swift Package Manager

Add Vizzly to your test target using Xcode:

1. File → Add Package Dependencies
2. Enter repository URL: `https://github.com/vizzly-testing/cli`
3. Select version and add to your UI test target

Or add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/vizzly-testing/cli", from: "1.0.0")
]
```

### CocoaPods

```ruby
pod 'Vizzly', :git => 'https://github.com/vizzly-testing/cli', :branch => 'main'
```

## Quick Start

### 1. Start Vizzly TDD Server

```bash
cd /path/to/your/ios/project
vizzly tdd start
```

This starts a local server at `http://localhost:47392` that receives screenshots and performs visual comparisons.

### 2. Add Vizzly to Your UI Tests

```swift
import XCTest
import Vizzly

class MyUITests: XCTestCase {
    let app = XCUIApplication()

    func testHomeScreen() {
        app.launch()

        // Capture screenshot - that's it!
        app.vizzlyScreenshot(name: "home-screen")
    }
}
```

### 3. Run Your Tests

```bash
# Via Xcode: Cmd+U
# Or via command line:
xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'
```

### 4. View Results

Open the dashboard at **http://localhost:47392/dashboard** to see visual comparisons, accept/reject changes, and review differences.

## Usage Examples

### Basic Screenshot

```swift
func testLoginScreen() {
    app.launch()
    app.buttons["Login"].tap()

    // Capture full screen
    app.vizzlyScreenshot(name: "login-screen")
}
```

### Screenshot with Properties

```swift
func testDarkMode() {
    app.launch()
    enableDarkMode()

    app.vizzlyScreenshot(
        name: "home-dark",
        properties: [
            "theme": "dark",
            "feature": "dark-mode"
        ]
    )
}
```

### Element Screenshot

```swift
func testNavigationBar() {
    let navbar = app.navigationBars.firstMatch

    // Capture just the navbar
    navbar.vizzlyScreenshot(
        name: "navbar",
        properties: ["component": "navbar"]
    )
}
```

### Custom Threshold

```swift
func testAnimatedContent() {
    // Allow up to 5% pixel difference (useful for animations)
    app.vizzlyScreenshot(
        name: "animated-banner",
        threshold: 5
    )
}
```

### Multiple Device Orientations

```swift
func testResponsiveLayout() {
    app.launch()

    // Portrait
    XCUIDevice.shared.orientation = .portrait
    app.vizzlyScreenshot(
        name: "home-portrait",
        properties: ["orientation": "portrait"]
    )

    // Landscape
    XCUIDevice.shared.orientation = .landscapeLeft
    app.vizzlyScreenshot(
        name: "home-landscape",
        properties: ["orientation": "landscape"]
    )
}
```

### Using the Client Directly

```swift
import Vizzly

func testWithDirectClient() {
    let screenshot = app.screenshot()

    VizzlyClient.shared.screenshot(
        name: "custom-screenshot",
        image: screenshot.pngRepresentation,
        properties: [
            "customProperty": "value",
            "browser": "Safari"
        ],
        threshold: 0
    )
}
```

## API Reference

### XCUIApplication Extensions

```swift
extension XCUIApplication {
    func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]?
}
```

### XCUIElement Extensions

```swift
extension XCUIElement {
    func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Int = 0
    ) -> [String: Any]?
}
```

### XCTestCase Extensions

```swift
extension XCTestCase {
    func vizzlyScreenshot(
        name: String,
        app: XCUIApplication,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]?

    func vizzlyScreenshot(
        name: String,
        element: XCUIElement,
        properties: [String: Any]? = nil,
        threshold: Int = 0
    ) -> [String: Any]?
}
```

### VizzlyClient

```swift
class VizzlyClient {
    static let shared: VizzlyClient

    func screenshot(
        name: String,
        image: Data,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]?

    var isReady: Bool { get }
    var info: [String: Any] { get }
    func flush()
    func disable(reason: String)
}
```

## Configuration

### Auto-Discovery

The SDK automatically discovers a running Vizzly TDD server using this priority order:

1. **VIZZLY_SERVER_URL environment variable** - Explicitly set server URL
2. **Global server file** - `~/.vizzly/server.json` written by CLI
3. **Default port health check** - Tests `http://localhost:47392/health`

When you run `vizzly tdd start`, the CLI automatically writes server info to `~/.vizzly/server.json` in your home directory, enabling zero-config discovery from iOS tests.

### Environment Variables

- `VIZZLY_SERVER_URL` - Server URL (e.g., `http://localhost:47392`)
- `VIZZLY_BUILD_ID` - Build identifier for grouping screenshots (set automatically in CI)

### Manual Configuration

```swift
// Override auto-discovery
let client = VizzlyClient(serverUrl: "http://localhost:47392")
```

## TDD Mode vs Cloud Mode

### TDD Mode (Local Development)

Start the TDD server locally:

```bash
vizzly tdd start
```

- Screenshots compared locally using high-performance Rust diffing
- Instant feedback via dashboard at `http://localhost:47392/dashboard`
- No API token required
- Fast iteration cycle

### Cloud Mode (CI/CD)

Set your API token and run in CI:

```bash
export VIZZLY_TOKEN="your-token-here"
vizzly run "xcodebuild test -scheme MyApp" --wait
```

- Screenshots uploaded to Vizzly cloud
- Team collaboration via web dashboard
- Supports parallel test execution
- Returns exit codes for CI integration

## Automatic Metadata

The SDK automatically captures:

- **Platform**: iOS or macOS
- **Device**: iPhone model, iPad model, or Mac
- **OS Version**: iOS/macOS version
- **Viewport**: Screen dimensions and scale factor
- **Element Type**: When screenshotting elements

This metadata helps differentiate screenshots across devices and configurations.

## Best Practices

### Naming Screenshots

Use descriptive, hierarchical names with dashes:

```swift
// ✅ Good - Use dashes for hierarchy
app.vizzlyScreenshot(name: "checkout-payment-form-valid-card")
app.vizzlyScreenshot(name: "settings-profile-edit-mode")

// ❌ Avoid - Generic names or slashes
app.vizzlyScreenshot(name: "screenshot1")
app.vizzlyScreenshot(name: "test")
app.vizzlyScreenshot(name: "checkout/payment/form")  // slashes cause validation errors
```

### Use Properties for Context

```swift
app.vizzlyScreenshot(
    name: "product-list",
    properties: [
        "theme": "dark",
        "user": "premium",
        "itemCount": 50
    ]
)
```

### Wait for Content

```swift
func testDynamicContent() {
    let element = app.buttons["Submit"]

    // Wait for element to exist
    XCTAssertTrue(element.waitForExistence(timeout: 5))

    // Now screenshot
    app.vizzlyScreenshot(name: "submit-button-visible")
}
```

### Isolate Visual Tests

Keep visual regression tests separate from functional tests for clarity:

```swift
// Good structure:
// - MyAppFunctionalTests.swift (no screenshots)
// - MyAppVisualTests.swift (Vizzly screenshots)
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Visual Tests

on: [push, pull_request]

jobs:
  ios-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run UI tests with Vizzly
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
        run: |
          npx vizzly run -- xcodebuild test \
            -scheme MyApp \
            -destination 'platform=iOS Simulator,name=iPhone 15' \
            -resultBundlePath TestResults
```

### Fastlane

```ruby
lane :visual_tests do
  sh "npx vizzly run -- bundle exec fastlane scan scheme:MyApp devices:'iPhone 15'"
end
```

## Troubleshooting

### Screenshots Not Being Captured

Check if Vizzly is ready:

```swift
override func setUpWithError() throws {
    if VizzlyClient.shared.isReady {
        print("✓ Vizzly ready: \(VizzlyClient.shared.info)")
    } else {
        print("⚠️  Vizzly not available")
    }
}
```

### Server Not Found

1. Ensure TDD server is running: `vizzly tdd start`
2. Check `~/.vizzly/server.json` exists in your home directory
3. Verify the server is reachable: `curl http://localhost:47392/health`
4. Or explicitly set: `export VIZZLY_SERVER_URL=http://localhost:47392`

### Visual Differences Not Showing

1. Open dashboard: `http://localhost:47392/dashboard`
2. Check console output for error messages
3. Verify screenshot names are consistent across runs
4. Look for threshold settings that might be too high

## Examples

Check out the `Example/` directory for:

- Basic screenshot tests
- Component-level screenshots
- Dark mode testing
- Orientation changes
- Custom properties and thresholds
- Direct client usage

## Contributing

Bug reports and pull requests are welcome at https://github.com/vizzly-testing/cli

## License

This SDK is available as open source under the terms of the MIT License.

## Learn More

- **Website**: https://vizzly.dev
- **Documentation**: https://docs.vizzly.dev
- **GitHub**: https://github.com/vizzly-testing/cli
- **Support**: support@vizzly.dev
