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
