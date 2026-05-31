import Foundation
import Vizzly
import XCTest

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AppKit)
import AppKit
#endif

enum VizzlyXCTestMetadata {
    static func merge(
        properties: [String: Any]?,
        automaticProperties: [String: Any]
    ) -> [String: Any] {
        var combinedProperties = automaticProperties

        for (key, value) in properties ?? [:] {
            combinedProperties[key] = value
        }

        return combinedProperties
    }

    static func applicationProperties(
        properties: [String: Any]?,
        viewport: [String: Any]? = defaultViewport()
    ) -> [String: Any] {
        var automaticProperties = platformProperties()

        if let viewport = viewport {
            automaticProperties["viewport"] = viewport
        }

        return merge(
            properties: properties,
            automaticProperties: automaticProperties
        )
    }

    static func elementProperties(
        properties: [String: Any]?,
        elementType: UInt
    ) -> [String: Any] {
        var automaticProperties = platformProperties()
        automaticProperties["elementType"] = elementType

        return merge(
            properties: properties,
            automaticProperties: automaticProperties
        )
    }

    static func platformProperties() -> [String: Any] {
        #if os(iOS)
        return [
            "platform": "iOS",
            "device": UIDevice.current.model,
            "osVersion": UIDevice.current.systemVersion
        ]
        #elseif os(macOS)
        return [
            "platform": "macOS",
            "osVersion": ProcessInfo.processInfo.operatingSystemVersionString
        ]
        #else
        return [:]
        #endif
    }

    static func defaultViewport() -> [String: Any]? {
        #if os(iOS)
        let screen = UIScreen.main
        return [
            "width": Int(screen.bounds.width * screen.scale),
            "height": Int(screen.bounds.height * screen.scale),
            "scale": screen.scale
        ]
        #elseif os(macOS)
        guard let screen = NSScreen.main else {
            return nil
        }

        return [
            "width": Int(screen.frame.width),
            "height": Int(screen.frame.height)
        ]
        #else
        return nil
        #endif
    }
}

/// XCTest extensions for easy Vizzly integration
extension XCTestCase {

    /// Capture a screenshot and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - app: The XCUIApplication instance (iOS/macOS)
    ///   - properties: Additional properties to attach
    ///   - threshold: Optional CIEDE2000 Delta E threshold. When nil, the
    ///     Vizzly server configuration is used.
    ///   - minClusterSize: Optional minimum changed-pixel cluster size to count
    ///     as a real difference. When nil, the server configuration is used.
    ///   - fullPage: Whether this is a full page screenshot
    ///   - buildId: Optional build ID override for grouping screenshots
    ///   - requestTimeout: Optional request timeout in milliseconds
    @available(iOS 13.0, macOS 10.15, *)
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        app: XCUIApplication,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        fullPage: Bool? = nil,
        buildId: String? = nil,
        requestTimeout: Double? = nil
    ) -> [String: Any]? {
        let screenshot = app.screenshot()

        let combinedProperties = VizzlyXCTestMetadata.applicationProperties(
            properties: properties
        )

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            minClusterSize: minClusterSize,
            fullPage: fullPage,
            buildId: buildId,
            requestTimeout: requestTimeout
        )
    }

    /// Capture a screenshot of a specific element and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - element: The XCUIElement to screenshot
    ///   - properties: Additional properties to attach
    ///   - threshold: Optional CIEDE2000 Delta E threshold. When nil, the
    ///     Vizzly server configuration is used.
    ///   - minClusterSize: Optional minimum changed-pixel cluster size to count
    ///     as a real difference. When nil, the server configuration is used.
    ///   - buildId: Optional build ID override for grouping screenshots
    ///   - requestTimeout: Optional request timeout in milliseconds
    @available(iOS 13.0, macOS 10.15, *)
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        element: XCUIElement,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        buildId: String? = nil,
        requestTimeout: Double? = nil
    ) -> [String: Any]? {
        let screenshot = element.screenshot()

        let combinedProperties = VizzlyXCTestMetadata.elementProperties(
            properties: properties,
            elementType: element.elementType.rawValue
        )

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            minClusterSize: minClusterSize,
            fullPage: false,
            buildId: buildId,
            requestTimeout: requestTimeout
        )
    }
}

/// Convenience extensions for XCUIApplication
@available(iOS 13.0, macOS 10.15, *)
extension XCUIApplication {

    /// Capture a screenshot and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - properties: Additional properties to attach
    ///   - threshold: Optional CIEDE2000 Delta E threshold. When nil, the
    ///     Vizzly server configuration is used.
    ///   - minClusterSize: Optional minimum changed-pixel cluster size to count
    ///     as a real difference. When nil, the server configuration is used.
    ///   - fullPage: Whether this is a full page screenshot
    ///   - buildId: Optional build ID override for grouping screenshots
    ///   - requestTimeout: Optional request timeout in milliseconds
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        fullPage: Bool? = nil,
        buildId: String? = nil,
        requestTimeout: Double? = nil
    ) -> [String: Any]? {
        let screenshot = self.screenshot()

        let combinedProperties = VizzlyXCTestMetadata.applicationProperties(
            properties: properties
        )

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            minClusterSize: minClusterSize,
            fullPage: fullPage,
            buildId: buildId,
            requestTimeout: requestTimeout
        )
    }
}

/// Convenience extensions for XCUIElement
@available(iOS 13.0, macOS 10.15, *)
extension XCUIElement {

    /// Capture a screenshot of this element and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - properties: Additional properties to attach
    ///   - threshold: Optional CIEDE2000 Delta E threshold. When nil, the
    ///     Vizzly server configuration is used.
    ///   - minClusterSize: Optional minimum changed-pixel cluster size to count
    ///     as a real difference. When nil, the server configuration is used.
    ///   - buildId: Optional build ID override for grouping screenshots
    ///   - requestTimeout: Optional request timeout in milliseconds
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        buildId: String? = nil,
        requestTimeout: Double? = nil
    ) -> [String: Any]? {
        let screenshot = self.screenshot()

        let combinedProperties = VizzlyXCTestMetadata.elementProperties(
            properties: properties,
            elementType: self.elementType.rawValue
        )

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            minClusterSize: minClusterSize,
            fullPage: false,
            buildId: buildId,
            requestTimeout: requestTimeout
        )
    }
}
