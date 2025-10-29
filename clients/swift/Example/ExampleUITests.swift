import XCTest
import Vizzly

/// Example UI tests demonstrating Vizzly integration
///
/// To run these tests with Vizzly:
///
/// 1. Start TDD server:
///    ```bash
///    cd /path/to/your/ios/project
///    vizzly tdd start
///    ```
///
/// 2. Run UI tests in Xcode or via command line:
///    ```bash
///    xcodebuild test -scheme YourApp -destination 'platform=iOS Simulator,name=iPhone 15'
///    ```
///
/// 3. View results in dashboard:
///    Open http://localhost:47392/dashboard
///
final class ExampleUITests: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = true
        app.launch()

        // Check if Vizzly is ready
        if VizzlyClient.shared.isReady {
            print("✓ Vizzly is ready!")
            print("  Info: \(VizzlyClient.shared.info)")
        } else {
            print("⚠️  Vizzly not available - screenshots will be skipped")
        }
    }

    // MARK: - Basic Screenshot Examples

    func testHomeScreen() throws {
        // Wait for home screen to load
        let welcomeText = app.staticTexts["Welcome"]
        XCTAssertTrue(welcomeText.waitForExistence(timeout: 5))

        // Capture full screen screenshot
        app.vizzlyScreenshot(name: "home-screen")
    }

    func testLoginForm() throws {
        // Navigate to login screen
        app.buttons["Login"].tap()

        // Wait for login form
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))

        // Capture login form
        app.vizzlyScreenshot(
            name: "login-form",
            properties: [
                "screen": "login",
                "state": "empty"
            ]
        )

        // Fill in form
        emailField.tap()
        emailField.typeText("test@vizzly.dev")

        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText("password123")

        // Capture filled form
        app.vizzlyScreenshot(
            name: "login-form-filled",
            properties: [
                "screen": "login",
                "state": "filled"
            ]
        )
    }

    // MARK: - Element Screenshot Examples

    func testNavigationBar() throws {
        let navbar = app.navigationBars.firstMatch
        XCTAssertTrue(navbar.exists)

        // Capture just the navigation bar
        navbar.vizzlyScreenshot(
            name: "navigation-bar",
            properties: ["component": "navbar"]
        )
    }

    func testProductCard() throws {
        // Find product card
        let productCard = app.otherElements["ProductCard"].firstMatch
        XCTAssertTrue(productCard.waitForExistence(timeout: 5))

        // Capture individual component
        productCard.vizzlyScreenshot(
            name: "product-card",
            properties: [
                "component": "product-card",
                "variant": "default"
            ]
        )
    }

    // MARK: - Advanced Examples

    func testDarkMode() throws {
        // Enable dark mode (implementation depends on your app)
        app.buttons["Settings"].tap()
        app.switches["Dark Mode"].tap()

        // Navigate back to home
        app.navigationBars.buttons.firstMatch.tap()

        // Capture dark mode screenshot
        app.vizzlyScreenshot(
            name: "home-screen-dark",
            properties: [
                "theme": "dark",
                "screen": "home"
            ]
        )
    }

    func testResponsiveLayout() throws {
        // Test different device orientations
        XCUIDevice.shared.orientation = .portrait
        sleep(1) // Wait for orientation change

        app.vizzlyScreenshot(
            name: "home-portrait",
            properties: ["orientation": "portrait"]
        )

        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(1)

        app.vizzlyScreenshot(
            name: "home-landscape",
            properties: ["orientation": "landscape"]
        )

        // Reset orientation
        XCUIDevice.shared.orientation = .portrait
    }

    func testScrollableContent() throws {
        let scrollView = app.scrollViews.firstMatch
        XCTAssertTrue(scrollView.exists)

        // Capture initial viewport
        app.vizzlyScreenshot(
            name: "feed-top",
            properties: ["scroll": "top"]
        )

        // Scroll down
        scrollView.swipeUp()
        scrollView.swipeUp()

        // Capture scrolled content
        app.vizzlyScreenshot(
            name: "feed-scrolled",
            properties: ["scroll": "middle"]
        )
    }

    // MARK: - Using XCTestCase Extension

    func testWithTestCaseExtension() throws {
        // You can also use the XCTestCase extension
        vizzlyScreenshot(
            name: "home-via-test-case",
            app: app,
            properties: ["method": "testcase-extension"]
        )
    }

    // MARK: - Custom Threshold Example

    func testWithCustomThreshold() throws {
        // Allow up to 5% pixel difference
        app.vizzlyScreenshot(
            name: "animation-test",
            threshold: 5,
            properties: ["note": "Animation may cause slight differences"]
        )
    }

    // MARK: - Direct Client Usage

    func testDirectClientUsage() throws {
        let screenshot = app.screenshot()

        VizzlyClient.shared.screenshot(
            name: "direct-client-usage",
            image: screenshot.pngRepresentation,
            properties: [
                "method": "direct-client",
                "custom": "properties"
            ],
            threshold: 0
        )
    }
}
