# iOS Integration Guide

Complete guide for adding Vizzly to your iOS app's UI tests.

## Step-by-Step Integration

### 1. Install Vizzly CLI

The CLI provides the TDD server and cloud upload capabilities.

```bash
pnpm install -g @vizzly-testing/cli
```

### 2. Add Swift SDK to Your Project

#### Option A: Swift Package Manager (Recommended)

In Xcode:

1. **File → Add Package Dependencies**
2. Enter URL: `https://github.com/vizzly-testing/cli`
3. Select version/branch
4. Add the `VizzlyXCTest` product to your **UI Test target**

Use the core `Vizzly` product directly only when you need to send PNG data from
app or test-support code without the XCTest convenience extensions.

#### Option B: Local Package

If you're developing locally or testing changes:

1. Clone the repo:
   ```bash
   git clone https://github.com/vizzly-testing/cli.git
   ```

2. In Xcode:
   - **File → Add Packages → Add Local...**
   - Select `/path/to/cli/clients/swift`
   - Add to UI test target

### 3. Initialize Vizzly in Your Project

Navigate to your iOS project root:

```bash
cd /path/to/MyiOSApp
```

Create a `vizzly.config.js` file (optional but recommended):

```javascript
import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig({
  server: {
    port: 47392,
  },
  comparison: {
    // Delta E comparison threshold. Omitted screenshots use server config.
    threshold: 0,
  },
});
```

### 4. Start TDD Server

```bash
vizzly tdd start --open
```

This starts a local server that will:
- Receive screenshots from your tests
- Compare them against baselines
- Serve a dashboard at the URL printed by the command

Vizzly uses port `47392` by default. If that port is busy, it auto-assigns
another free port and prints that URL instead.

For a one-off run, wrap your test command:

```bash
vizzly tdd run \
  "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'" \
  --no-open
```

That writes local review data under `.vizzly/` and creates a static report at
`.vizzly/report/index.html` when screenshots are captured.

### 5. Write UI Tests with Vizzly

Create or update your UI test file:

```swift
import XCTest
import Vizzly
import VizzlyXCTest

final class MyAppUITests: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = true
        app.launch()

        // Optional: Log Vizzly status
        print("Vizzly ready: \(VizzlyClient.shared.isReady)")
    }

    func testLaunchScreen() {
        // Wait for launch screen
        let logo = app.images["AppLogo"]
        XCTAssertTrue(logo.waitForExistence(timeout: 5))

        // Capture screenshot
        app.vizzlyScreenshot(name: "launch-screen")
    }

    func testHomeScreen() {
        // Wait for home screen
        let homeTitle = app.navigationBars["Home"]
        XCTAssertTrue(homeTitle.waitForExistence(timeout: 5))

        // Capture with properties
        app.vizzlyScreenshot(
            name: "home-screen",
            properties: [
                "section": "home",
                "authenticated": false
            ]
        )
    }
}
```

### 6. Run Tests

#### Via Xcode

1. Select your UI test scheme
2. Choose a simulator/device
3. Press `Cmd+U` or Product → Test

#### Via Command Line

```bash
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:MyAppUITests
```

### 7. Review Results

Open the dashboard in your browser:

```
http://localhost:47392/dashboard
```

You'll see:
- ✅ **Passed**: Screenshots that match baselines
- ⚠️ **Failed**: Screenshots with visual differences
- 🆕 **New**: First-time screenshots without baselines

Click on any comparison to see side-by-side diffs, then accept or reject changes.

## Project Structure

Here's a recommended structure for your iOS project:

```
MyiOSApp/
├── MyApp/                          # Main app target
│   ├── App/
│   ├── Views/
│   └── ...
├── MyAppTests/                     # Unit tests
│   └── ...
├── MyAppUITests/                   # UI tests (add Vizzly here)
│   ├── LaunchTests.swift
│   ├── HomeScreenTests.swift
│   └── CheckoutFlowTests.swift
├── vizzly.config.js               # Vizzly config (optional)
├── .vizzly/                       # Created by TDD server
│   ├── baselines/                 # Baseline screenshots
│   ├── current/                   # Current test screenshots
│   ├── diffs/                     # Diff images
│   └── server.json                # Server metadata
└── .gitignore                     # Add .vizzly/current and .vizzly/diffs
```

## .gitignore Configuration

Add these lines to your `.gitignore`:

```gitignore
# Vizzly - commit baselines, ignore current/diffs
.vizzly/current/
.vizzly/diffs/
.vizzly/server.json
```

**Important**: Commit `.vizzly/baselines/` so your team shares the same baseline screenshots.

## Testing Multiple Devices

```swift
// Run tests on different simulators to capture device-specific screenshots
// Vizzly automatically includes device info in properties

func testResponsiveDesign() {
    app.launch()

    // The SDK automatically captures:
    // - Device model (iPhone 15, iPad Air, etc.)
    // - Screen dimensions
    // - Scale factor

    app.vizzlyScreenshot(name: "home-screen")
}
```

Run tests on multiple simulators:

```bash
# iPhone 15
xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'

# iPhone 15 Pro Max
xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max'

# iPad Air
xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPad Air (5th generation)'
```

Each device creates separate baselines due to different viewport metadata.

## Dark Mode Testing

```swift
func testDarkMode() {
    app.launch()

    // Enable dark mode programmatically
    app.buttons["Settings"].tap()
    app.switches["Appearance"].tap() // Toggle to dark

    app.buttons["Done"].tap()

    // Capture dark mode screenshot
    app.vizzlyScreenshot(
        name: "home-dark",
        properties: ["theme": "dark"]
    )
}
```

Or test both modes in one test:

```swift
func testBothThemes() {
    app.launch()

    // Light mode
    app.vizzlyScreenshot(name: "home", properties: ["theme": "light"])

    // Switch to dark
    toggleDarkMode()

    // Dark mode
    app.vizzlyScreenshot(name: "home", properties: ["theme": "dark"])
}
```

## Handling Animations

For views with animations or timing-sensitive content:

```swift
func testAnimatedView() {
    app.launch()

    let finishedState = app.otherElements["AnimatedBannerReady"]
    XCTAssertTrue(finishedState.waitForExistence(timeout: 5))

    // Use a Delta E comparison threshold for slight visual variations
    app.vizzlyScreenshot(
        name: "animated-banner",
        threshold: 5
    )
}
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/visual-tests.yml`:

```yaml
name: Visual Regression Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ios-visual-tests:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v3

      - name: Select Xcode version
        run: sudo xcode-select -s /Applications/Xcode_15.0.app

      - name: Install Vizzly CLI
        run: pnpm install -g @vizzly-testing/cli

      - name: Run UI Tests with Vizzly
        env:
          VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
        run: |
          vizzly run "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:MyAppUITests"
```

### Fastlane

Add to your `Fastfile`:

```ruby
lane :visual_tests do
  sh("pnpm exec vizzly run \"bundle exec fastlane scan scheme:MyApp devices:'iPhone 15' only_testing:MyAppUITests\"")
end
```

## Advanced Patterns

### Page Object Pattern

```swift
// Pages/HomePage.swift
import XCTest

class HomePage {
    let app: XCUIApplication

    init(app: XCUIApplication) {
        self.app = app
    }

    var title: XCUIElement {
        app.navigationBars["Home"]
    }

    var loginButton: XCUIElement {
        app.buttons["Login"]
    }

    func screenshot(name: String) {
        app.vizzlyScreenshot(
            name: "home-\(name)",
            properties: ["page": "home"]
        )
    }
}

// Test usage
func testHomePage() {
    let homePage = HomePage(app: app)

    XCTAssertTrue(homePage.title.waitForExistence(timeout: 5))
    homePage.screenshot(name: "initial")

    homePage.loginButton.tap()
    // ... continue test
}
```

### Component Testing

```swift
func testReusableComponents() {
    app.launch()

    // Test button variants
    for variant in ["primary", "secondary", "destructive"] {
        let button = app.buttons["\(variant)Button"]

        button.vizzlyScreenshot(
            name: "components-button-\(variant)",
            properties: [
                "component": "button",
                "variant": variant
            ]
        )
    }
}
```

## Troubleshooting

### Tests Pass But No Screenshots Captured

**Cause**: Vizzly server not running or not discoverable.

**Solution**:

1. Check server is running: `vizzly tdd status`
2. If not, start it: `vizzly tdd start`
3. Verify `.vizzly/server.json` exists in your project
4. Add debug logging:

```swift
override func setUpWithError() throws {
    print("Vizzly info: \(VizzlyClient.shared.info)")
}
```

### Screenshots Different on CI vs Local

**Cause**: Different simulator versions, screen sizes, or font rendering.

**Solution**:

1. Pin simulator versions in CI to match local
2. Use consistent device names
3. Consider a slightly higher Delta E comparison threshold for font rendering differences

### "Connection Refused" Errors

**Cause**: TDD server not running or wrong port.

**Solution**:

```bash
# Check if server is running
vizzly tdd status

# Check what's running on port 47392
lsof -i :47392

# Restart server
vizzly tdd stop
vizzly tdd start
```

### Server Not Found

**Cause**: SDK cannot discover the running server.

**Solution**:

1. Ensure TDD server is running: `vizzly tdd start`
2. Check `~/.vizzly/server.json` exists in your home directory
3. Verify the server is reachable: `curl http://localhost:47392/health`
4. Or explicitly set: `export VIZZLY_SERVER_URL=http://localhost:47392`

## Best Practices

1. **Separate Visual Tests**: Keep visual regression tests in dedicated test files
2. **Descriptive Names**: Use hierarchical names like `checkout-payment-valid-card` (use dashes, not slashes)
3. **Wait for Content**: Always wait for elements before screenshotting
4. **Commit Baselines**: Add `.vizzly/baselines/` to version control
5. **Use Properties**: Tag screenshots with context (theme, user state, etc.)
6. **Test Critical Flows**: Focus on user-facing screens and key journeys
7. **Automate in CI**: Run visual tests on every PR

## Next Steps

- Explore the [Example Tests](Example/ExampleUITests.swift) for more patterns
- Read the [main README](README.md) for API reference
- Check [Vizzly docs](https://docs.vizzly.dev) for cloud features
- Join the community: https://github.com/vizzly-testing/cli/discussions
