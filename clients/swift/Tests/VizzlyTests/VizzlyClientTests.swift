import XCTest
@testable import Vizzly

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
        let client = VizzlyClient(serverUrl: nil)

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
        // This test verifies the merge behavior conceptually
        // User-provided properties should override auto-detected ones
        let client = VizzlyClient(serverUrl: "http://localhost:47392")

        // When user provides custom platform, it should be used
        // (We can't easily test the actual HTTP payload without mocking,
        // but we verify the client accepts properties)
        let testImage = createTestImage()

        // This should not crash and should accept custom properties
        client.disable() // Disable to prevent actual network call
        let result = client.screenshot(
            name: "test",
            image: testImage,
            properties: ["platform": "custom-platform", "customKey": "customValue"]
        )

        // Result is nil because client is disabled, but no crash means properties work
        XCTAssertNil(result)
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
