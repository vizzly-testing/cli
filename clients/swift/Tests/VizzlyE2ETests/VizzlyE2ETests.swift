import XCTest
import Vizzly

#if os(macOS)
import AppKit
#endif

final class VizzlyE2ETests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()

        guard ProcessInfo.processInfo.environment["VIZZLY_E2E"] == "1" else {
            throw XCTSkip("Set VIZZLY_E2E=1 to run Swift SDK E2E tests")
        }
    }

    func testUploadsScreenshotThroughRunningTddServer() throws {
        let client = VizzlyClient()
        XCTAssertTrue(client.isReady, "Expected VizzlyClient to discover the TDD server")

        let firstResult = try XCTUnwrap(
            client.screenshot(
                name: "swift-sdk-e2e-home",
                image: try Self.makeTestPng(),
                properties: [
                    "platform": "swift-e2e",
                    "screen": "home"
                ],
                threshold: 1.5,
                minClusterSize: 3,
                fullPage: true
            )
        )

        XCTAssertTrue(
            Self.isSuccessfulUpload(firstResult),
            "Expected first upload to create or match a baseline, got: \(firstResult)"
        )
        XCTAssertEqual(firstResult["name"] as? String, "swift-sdk-e2e-home")

        if Self.hasTddComparisonMetadata(firstResult) {
            XCTAssertNotNil(firstResult["current"])
            XCTAssertNotNil(firstResult["baseline"])
        }
    }

    func testSecondUploadMatchesExistingBaseline() throws {
        let client = VizzlyClient()

        let firstResult = try XCTUnwrap(
            client.screenshot(
                name: "swift-sdk-e2e-repeatable",
                image: try Self.makeTestPng(),
                properties: ["case": "repeatable"]
            )
        )
        XCTAssertTrue(
            Self.isSuccessfulUpload(firstResult),
            "Expected first upload to create or match a baseline, got: \(firstResult)"
        )

        let secondResult = try XCTUnwrap(
            client.screenshot(
                name: "swift-sdk-e2e-repeatable",
                image: try Self.makeTestPng(),
                properties: ["case": "repeatable"]
            )
        )
        XCTAssertTrue(
            Self.isSuccessfulUpload(secondResult),
            "Expected second upload to succeed, got: \(secondResult)"
        )

        if let status = secondResult["status"] as? String {
            XCTAssertEqual(status, "match")
        }
    }

    private static let successStatuses: Set<String> = ["new", "match"]

    private static func isSuccessfulUpload(_ result: [String: Any]) -> Bool {
        if let status = result["status"] as? String {
            return successStatuses.contains(status)
        }

        if let success = result["success"] as? Bool {
            return success
        }

        if let success = result["success"] as? Int {
            return success == 1
        }

        return false
    }

    private static func hasTddComparisonMetadata(_ result: [String: Any]) -> Bool {
        return result["status"] != nil
    }

    private static func makeTestPng() throws -> Data {
        #if os(macOS)
        let image = NSImage(size: NSSize(width: 2, height: 2))
        image.lockFocus()
        NSColor.systemBlue.setFill()
        NSRect(x: 0, y: 0, width: 2, height: 2).fill()
        image.unlockFocus()

        let tiffData = try XCTUnwrap(image.tiffRepresentation)
        let bitmap = try XCTUnwrap(NSBitmapImageRep(data: tiffData))
        return try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
        #else
        throw XCTSkip("Swift SDK E2E PNG fixture generation currently runs on macOS")
        #endif
    }
}
