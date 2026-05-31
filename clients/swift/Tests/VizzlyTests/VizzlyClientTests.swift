import XCTest
@testable import Vizzly
@testable import VizzlyXCTest

final class VizzlyClientTests: XCTestCase {

    func testClientInitialization() {
        let client = VizzlyClient()
        XCTAssertNotNil(client)
    }

    func testClientWithCustomUrl() {
        let customUrl = "http://localhost:9999"
        let client = VizzlyClient(serverUrl: customUrl)
        XCTAssertEqual(client.serverUrl, customUrl)
    }

    func testClientInfo() {
        let client = VizzlyClient()
        let info = client.info

        XCTAssertNotNil(info["enabled"])
        XCTAssertNotNil(info["ready"])
        XCTAssertNotNil(info["disabled"])
        XCTAssertNotNil(info["failOnDiff"])

        XCTAssertTrue(info["enabled"] as? Bool ?? false)
        XCTAssertFalse(info["disabled"] as? Bool ?? true)
        XCTAssertFalse(info["failOnDiff"] as? Bool ?? true)
    }

    func testClientInfoExposesConfiguredFailOnDiff() {
        let enabledClient = VizzlyClient(autoDiscover: false, failOnDiff: true)
        let disabledClient = VizzlyClient(autoDiscover: false, failOnDiff: false)

        XCTAssertEqual(enabledClient.info["failOnDiff"] as? Bool, true)
        XCTAssertEqual(disabledClient.info["failOnDiff"] as? Bool, false)
    }

    func testClientDisable() {
        let client = VizzlyClient()

        XCTAssertFalse(client.isDisabled)
        XCTAssertTrue(client.isReady || client.serverUrl == nil)

        client.disable()

        XCTAssertTrue(client.isDisabled)
        XCTAssertFalse(client.isReady)
    }

    func testFlush() {
        let client = VizzlyClient()
        // Flush should not crash
        client.flush()
    }

    func testScreenshotWithDisabledClient() {
        let client = VizzlyClient()
        client.disable()

        let testImage = createTestImage()
        let result = client.screenshot(name: "test", image: testImage)

        XCTAssertNil(result)
    }

    func testScreenshotWithNoServer() {
        // Create client with invalid server URL
        let client = VizzlyClient(serverUrl: nil, autoDiscover: false)

        let testImage = createTestImage()
        let result = client.screenshot(name: "test", image: testImage)

        XCTAssertNil(result)
        XCTAssertTrue(client.isDisabled)
    }

    func testDeviceInfoIsPopulated() {
        let client = VizzlyClient()
        let info = client.info

        // Device info should be available (platform at minimum)
        // The exact values depend on the test environment
        #if os(iOS) || os(tvOS)
        XCTAssertNotNil(info["enabled"])
        // Device info is internal, but we can verify the client works
        #elseif os(macOS)
        XCTAssertNotNil(info["enabled"])
        #endif
    }

    func testUserPropertiesTakePrecedence() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage(),
            properties: [
                "platform": "custom-platform",
                "customKey": "customValue"
            ],
            deviceInfo: [
                "platform": "iOS",
                "deviceName": "iPhone"
            ]
        )

        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?["platform"] as? String, "custom-platform")
        XCTAssertEqual(properties?["customKey"] as? String, "customValue")
        XCTAssertEqual(properties?["deviceName"] as? String, "iPhone")
    }

    func testComparisonOptionsAreSentAsProperties() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage(),
            properties: ["theme": "dark"],
            threshold: 1.5,
            minClusterSize: 4,
            fullPage: true
        )

        XCTAssertNil(payload["threshold"])
        XCTAssertNil(payload["minClusterSize"])

        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?["theme"] as? String, "dark")
        XCTAssertEqual(properties?["threshold"] as? Double, 1.5)
        XCTAssertEqual(properties?["minClusterSize"] as? Int, 4)
        XCTAssertEqual(properties?["fullPage"] as? Bool, true)
    }

    func testExplicitFullPageFalseIsSentAsProperty() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage(),
            fullPage: false
        )

        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?["fullPage"] as? Bool, false)
    }

    func testPerCallBuildIdIsSentOutsideProperties() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage(),
            properties: ["theme": "dark"],
            buildId: "build-from-call"
        )

        XCTAssertEqual(payload["buildId"] as? String, "build-from-call")
        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?["theme"] as? String, "dark")
        XCTAssertNil(properties?["buildId"])
    }

    func testBrowserAndNestedViewportPropertiesAreSent() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "responsive-homepage",
            image: createTestImage(),
            properties: [
                "browser": "chrome",
                "viewport": [
                    "width": 1920,
                    "height": 1080
                ]
            ]
        )

        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?["browser"] as? String, "chrome")

        let viewport = properties?["viewport"] as? [String: Any]
        XCTAssertEqual(viewport?["width"] as? Int, 1920)
        XCTAssertEqual(viewport?["height"] as? Int, 1080)
    }

    func testDefaultComparisonOptionsUseServerConfiguration() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage()
        )

        XCTAssertNil(payload["threshold"])
        XCTAssertNil(payload["minClusterSize"])
        XCTAssertNil(payload["fullPage"])
        let properties = payload["properties"] as? [String: Any]
        XCTAssertEqual(properties?.isEmpty, true)
    }

    func testXCTestApplicationMetadataMergesUserProperties() {
        let properties = VizzlyXCTestMetadata.applicationProperties(
            properties: [
                "platform": "custom-platform",
                "theme": "dark"
            ],
            viewport: [
                "width": 390,
                "height": 844
            ]
        )

        XCTAssertEqual(properties["platform"] as? String, "custom-platform")
        XCTAssertEqual(properties["theme"] as? String, "dark")

        let viewport = properties["viewport"] as? [String: Any]
        XCTAssertEqual(viewport?["width"] as? Int, 390)
        XCTAssertEqual(viewport?["height"] as? Int, 844)
    }

    func testXCTestElementMetadataMergesElementTypeAndUserProperties() {
        let properties = VizzlyXCTestMetadata.elementProperties(
            properties: [
                "state": "selected"
            ],
            elementType: 42
        )

        XCTAssertEqual(properties["elementType"] as? UInt, 42)
        XCTAssertEqual(properties["state"] as? String, "selected")
        XCTAssertNotNil(properties["platform"])
    }

    // MARK: - Helpers

    private func createTestImage() -> Data {
        // Create a simple 1x1 pixel PNG
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

        guard let context = CGContext(
            data: nil,
            width: 1,
            height: 1,
            bitsPerComponent: 8,
            bytesPerRow: 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ) else {
            return Data()
        }

        context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))

        guard let cgImage = context.makeImage() else {
            return Data()
        }

        #if os(iOS)
        let image = UIImage(cgImage: cgImage)
        return image.pngData() ?? Data()
        #elseif os(macOS)
        let image = NSImage(cgImage: cgImage, size: NSSize(width: 1, height: 1))
        guard let tiffData = image.tiffRepresentation,
              let bitmapImage = NSBitmapImageRep(data: tiffData),
              let pngData = bitmapImage.representation(using: .png, properties: [:]) else {
            return Data()
        }
        return pngData
        #else
        return Data()
        #endif
    }
}
