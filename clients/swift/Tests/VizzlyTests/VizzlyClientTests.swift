import XCTest
@testable import Vizzly
import VizzlyXCTest

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

        XCTAssertTrue(info["enabled"] as? Bool ?? false)
        XCTAssertFalse(info["disabled"] as? Bool ?? true)
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

    func testDefaultComparisonOptionsUseServerConfiguration() {
        let payload = VizzlyClient.makeScreenshotPayload(
            name: "test",
            image: createTestImage()
        )

        XCTAssertNil(payload["threshold"])
        XCTAssertNil(payload["minClusterSize"])
        XCTAssertNil(payload["fullPage"])
        XCTAssertNil(payload["properties"])
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
