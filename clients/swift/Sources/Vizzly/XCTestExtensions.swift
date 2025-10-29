import Foundation
import XCTest

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AppKit)
import AppKit
#endif

/// XCTest extensions for easy Vizzly integration
extension XCTestCase {

    /// Capture a screenshot and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - app: The XCUIApplication instance (iOS/macOS)
    ///   - properties: Additional properties to attach
    ///   - threshold: Pixel difference threshold (0-100)
    ///   - fullPage: Whether this is a full page screenshot
    @available(iOS 13.0, macOS 10.15, *)
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        app: XCUIApplication,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]? {
        let screenshot = app.screenshot()

        var combinedProperties = properties ?? [:]

        // Add device/platform info automatically
        #if os(iOS)
        combinedProperties["platform"] = "iOS"
        combinedProperties["device"] = UIDevice.current.model
        combinedProperties["osVersion"] = UIDevice.current.systemVersion

        // Add screen size
        let screen = UIScreen.main
        combinedProperties["viewport"] = [
            "width": Int(screen.bounds.width * screen.scale),
            "height": Int(screen.bounds.height * screen.scale),
            "scale": screen.scale
        ]
        #elseif os(macOS)
        combinedProperties["platform"] = "macOS"

        if let screen = NSScreen.main {
            combinedProperties["viewport"] = [
                "width": Int(screen.frame.width),
                "height": Int(screen.frame.height)
            ]
        }
        #endif

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            fullPage: fullPage
        )
    }

    /// Capture a screenshot of a specific element and send it to Vizzly
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - element: The XCUIElement to screenshot
    ///   - properties: Additional properties to attach
    ///   - threshold: Pixel difference threshold (0-100)
    @available(iOS 13.0, macOS 10.15, *)
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        element: XCUIElement,
        properties: [String: Any]? = nil,
        threshold: Int = 0
    ) -> [String: Any]? {
        let screenshot = element.screenshot()

        var combinedProperties = properties ?? [:]

        // Add element info
        combinedProperties["elementType"] = element.elementType.rawValue

        #if os(iOS)
        combinedProperties["platform"] = "iOS"
        #elseif os(macOS)
        combinedProperties["platform"] = "macOS"
        #endif

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            fullPage: false
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
    ///   - threshold: Pixel difference threshold (0-100)
    ///   - fullPage: Whether this is a full page screenshot
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]? {
        let screenshot = self.screenshot()

        var combinedProperties = properties ?? [:]

        #if os(iOS)
        combinedProperties["platform"] = "iOS"
        combinedProperties["device"] = UIDevice.current.model

        let screen = UIScreen.main
        combinedProperties["viewport"] = [
            "width": Int(screen.bounds.width * screen.scale),
            "height": Int(screen.bounds.height * screen.scale),
            "scale": screen.scale
        ]
        #elseif os(macOS)
        combinedProperties["platform"] = "macOS"
        #endif

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            fullPage: fullPage
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
    ///   - threshold: Pixel difference threshold (0-100)
    @discardableResult
    public func vizzlyScreenshot(
        name: String,
        properties: [String: Any]? = nil,
        threshold: Int = 0
    ) -> [String: Any]? {
        let screenshot = self.screenshot()

        var combinedProperties = properties ?? [:]
        combinedProperties["elementType"] = self.elementType.rawValue

        #if os(iOS)
        combinedProperties["platform"] = "iOS"
        #elseif os(macOS)
        combinedProperties["platform"] = "macOS"
        #endif

        return VizzlyClient.shared.screenshot(
            name: name,
            image: screenshot.pngRepresentation,
            properties: combinedProperties,
            threshold: threshold,
            fullPage: false
        )
    }
}
