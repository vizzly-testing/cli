import Foundation

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AppKit)
import AppKit
#endif

#if canImport(WatchKit)
import WatchKit
#endif

private enum VizzlyClientError: LocalizedError {
    case requestTimedOut

    var errorDescription: String? {
        switch self {
        case .requestTimedOut:
            return "request timed out"
        }
    }
}

/// Vizzly visual regression testing client for Swift/iOS.
///
/// A lightweight client SDK for capturing screenshots and sending them to
/// Vizzly for visual regression testing. Works with both local TDD mode and
/// cloud builds.
///
/// ## Usage
///
/// ```swift
/// import Vizzly
///
/// let client = VizzlyClient.shared
/// let screenshot = app.screenshot()
/// client.screenshot(name: "login-screen", image: screenshot.pngRepresentation)
/// ```
public final class VizzlyClient {
    private struct ScreenshotResponse {
        var data: Data?
        var response: URLResponse?
        var error: Error?
    }

    private final class ScreenshotRequestState {
        private let lock = NSLock()
        private var didTimeOut = false
        private var response = ScreenshotResponse()

        func complete(data: Data?, response: URLResponse?, error: Error?) {
            lock.lock()
            defer { lock.unlock() }

            guard !didTimeOut else { return }

            self.response = ScreenshotResponse(
                data: data,
                response: response,
                error: error
            )
        }

        func timeOut() {
            lock.lock()
            defer { lock.unlock() }

            didTimeOut = true
            response.error = VizzlyClientError.requestTimedOut
        }

        var currentResponse: ScreenshotResponse {
            lock.lock()
            defer { lock.unlock() }

            return response
        }
    }

    /// Shared singleton instance
    public static let shared = VizzlyClient()

    /// Server URL for screenshot uploads
    public private(set) var serverUrl: String?

    /// Whether the client is disabled (due to errors)
    public private(set) var isDisabled = false

    private var hasWarned = false
    private let defaultTddPort = 47392
    private let configuredFailOnDiff: Bool?
    private var discoveredFailOnDiff = false

    /// Initialize a new Vizzly client
    ///
    /// - Parameter serverUrl: Optional server URL. If not provided, auto-discovery will be used.
    /// - Parameter autoDiscover: Whether to discover a local Vizzly server when
    ///   `serverUrl` is nil.
    /// - Parameter failOnDiff: Optional override for failing local TDD visual diffs.
    public init(
        serverUrl: String? = nil,
        autoDiscover: Bool = true,
        failOnDiff: Bool? = nil
    ) {
        self.configuredFailOnDiff = failOnDiff
        self.serverUrl = serverUrl ?? (autoDiscover ? discoverServerUrl() : nil)
    }

    /// Take a screenshot for visual regression testing
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - image: PNG image data
    ///   - properties: Additional properties to attach (browser, viewport, etc.)
    ///   - threshold: Optional CIEDE2000 Delta E threshold. When nil, the
    ///     Vizzly server configuration is used.
    ///   - minClusterSize: Optional minimum changed-pixel cluster size to count
    ///     as a real difference. When nil, the server configuration is used.
    ///   - fullPage: Whether this is a full page screenshot
    ///   - buildId: Optional build ID override for grouping screenshots
    ///   - requestTimeout: Optional request timeout in milliseconds
    /// - Returns: Response data if successful, nil otherwise
    @discardableResult
    public func screenshot(
        name: String,
        image: Data,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        fullPage: Bool? = nil,
        buildId: String? = nil,
        requestTimeout: Double? = nil
    ) -> [String: Any]? {
        guard !isDisabled else { return nil }

        guard let serverUrl = serverUrl else {
            warnOnce("Vizzly client not initialized. Screenshots will be skipped.")
            disable()
            return nil
        }

        let payload = Self.makeScreenshotPayload(
            name: name,
            image: image,
            properties: properties,
            threshold: threshold,
            minClusterSize: minClusterSize,
            fullPage: fullPage,
            buildId: buildId ?? getBuildId(),
            deviceInfo: getDeviceInfo()
        )

        // Send HTTP request
        guard let url = URL(string: "\(serverUrl)/screenshot") else {
            print("❌ Invalid server URL: \(serverUrl)")
            disable()
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = requestTimeout.map { $0 / 1000.0 } ?? 30

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            print("❌ Failed to encode screenshot payload: \(error)")
            return nil
        }

        let response = send(request)

        if let error = response.error {
            handleError(name: name, error: error)
            return nil
        }

        guard let httpResponse = response.response as? HTTPURLResponse else {
            print("❌ Invalid response for screenshot: \(name)")
            disable(reason: "failure")
            return nil
        }

        guard let data = response.data else {
            print("❌ No data received for screenshot: \(name)")
            disable(reason: "failure")
            return nil
        }

        if httpResponse.statusCode != 200 {
            handleNonSuccessResponse(
                statusCode: httpResponse.statusCode,
                data: data,
                name: name
            )
            return nil
        }

        let parsedResponse = parseScreenshotResponse(data, name: name)
        if shouldFailOnDiff(),
           let responseBody = parsedResponse,
           responseBody["tddMode"] as? Bool == true,
           let status = responseBody["status"] as? String,
           ["diff", "failed"].contains(status) {
            let diffPercentage = responseBody["diffPercentage"] ?? 0
            print("❌ Visual diff detected for \"\(responseBody["name"] ?? name)\" (\(diffPercentage)% difference)")
            disable(reason: "visual diff")
            return nil
        }

        return parsedResponse
    }

    /// Compatibility no-op for older integrations.
    public func flush() {
        // Simple client doesn't queue screenshots
    }

    /// Check if the client is ready to capture screenshots
    public var isReady: Bool {
        return !isDisabled && serverUrl != nil
    }

    /// Disable screenshot capture
    ///
    /// - Parameter reason: Optional reason for disabling
    public func disable(reason: String = "disabled") {
        isDisabled = true

        if reason != "disabled" {
            print("⚠️  Vizzly SDK disabled due to \(reason). Screenshots will be skipped for the remainder of this session.")
        }
    }

    /// Get client information
    public var info: [String: Any] {
        var info: [String: Any] = [
            "enabled": !isDisabled,
            "ready": isReady,
            "disabled": isDisabled,
            "failOnDiff": shouldFailOnDiff()
        ]

        if let serverUrl = serverUrl {
            info["serverUrl"] = serverUrl
        }

        if let buildId = getBuildId() {
            info["buildId"] = buildId
        }

        return info
    }

    // MARK: - Private Methods

    internal static func makeScreenshotPayload(
        name: String,
        image: Data,
        properties: [String: Any]? = nil,
        threshold: Double? = nil,
        minClusterSize: Int? = nil,
        fullPage: Bool? = nil,
        buildId: String? = nil,
        deviceInfo: [String: Any] = [:]
    ) -> [String: Any] {
        var mergedProperties = properties ?? [:]

        for (key, value) in deviceInfo {
            if mergedProperties[key] == nil {
                mergedProperties[key] = value
            }
        }

        if let threshold = threshold {
            mergedProperties["threshold"] = threshold
        }

        if let minClusterSize = minClusterSize {
            mergedProperties["minClusterSize"] = minClusterSize
        }

        if let fullPage = fullPage {
            mergedProperties["fullPage"] = fullPage
        }

        var payload: [String: Any] = [
            "name": name,
            "image": image.base64EncodedString(),
            "type": "base64"
        ]

        payload["properties"] = mergedProperties

        if let buildId = buildId {
            payload["buildId"] = buildId
        }

        return payload
    }

    private func getDeviceInfo() -> [String: Any] {
        var info: [String: Any] = [:]

        #if os(iOS) || os(tvOS)
        let device = UIDevice.current
        info["platform"] = "iOS"
        info["deviceName"] = device.name
        info["deviceModel"] = device.model
        info["osVersion"] = device.systemVersion
        info["osName"] = device.systemName
        #elseif os(macOS)
        info["platform"] = "macOS"
        info["osVersion"] = ProcessInfo.processInfo.operatingSystemVersionString
        info["deviceName"] = Host.current().localizedName ?? "Mac"
        #elseif os(watchOS)
        let device = WKInterfaceDevice.current()
        info["platform"] = "watchOS"
        info["deviceName"] = device.name
        info["deviceModel"] = device.model
        info["osVersion"] = device.systemVersion
        info["osName"] = device.systemName
        #endif

        return info
    }

    private func warnOnce(_ message: String) {
        guard !hasWarned else { return }
        print("⚠️  \(message)")
        hasWarned = true
    }

    private func send(_ request: URLRequest) -> ScreenshotResponse {
        let semaphore = DispatchSemaphore(value: 0)
        let state = ScreenshotRequestState()

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            state.complete(
                data: data,
                response: response,
                error: error
            )
        }

        task.resume()
        if semaphore.wait(timeout: .now() + request.timeoutInterval + 5) == .timedOut {
            state.timeOut()
            task.cancel()
        }

        return state.currentResponse
    }

    private func parseScreenshotResponse(_ data: Data, name: String) -> [String: Any]? {
        do {
            return try JSONSerialization.jsonObject(with: data) as? [String: Any]
        } catch {
            print("⚠️  Failed to parse response for \(name): \(error)")
            return nil
        }
    }

    private func discoverServerUrl() -> String? {
        // 1. Check VIZZLY_SERVER_URL environment variable (highest priority, set by CLI or test runner)
        if let envUrl = ProcessInfo.processInfo.environment["VIZZLY_SERVER_URL"] {
            return envUrl
        }

        // 2. Check for project-local server info first (.vizzly/server.json in current directory)
        let fileManager = FileManager.default
        let currentDir = fileManager.currentDirectoryPath
        let localServerFile = (currentDir as NSString).appendingPathComponent(".vizzly/server.json")

        if let url = readServerInfoFile(localServerFile) {
            return url
        }

        // 3. Check for global server info written by CLI (supports custom ports)
        if let homeDir = ProcessInfo.processInfo.environment["HOME"] {
            let globalServerFile = (homeDir as NSString).appendingPathComponent(".vizzly/server.json")
            if let url = readServerInfoFile(globalServerFile) {
                return url
            }
        }

        // 4. Try default TDD port as fallback (zero-config for default setup)
        let defaultUrl = "http://localhost:\(defaultTddPort)"
        if checkServerReachable(defaultUrl) {
            return defaultUrl
        }

        return nil
    }

    private func readServerInfoFile(_ filePath: String) -> String? {
        guard let serverData = try? Data(contentsOf: URL(fileURLWithPath: filePath)),
              let serverInfo = try? JSONSerialization.jsonObject(with: serverData) as? [String: Any] else {
            return nil
        }

        // Handle port as either Int or String
        let port: Int?
        if let portInt = serverInfo["port"] as? Int {
            port = portInt
        } else if let portString = serverInfo["port"] as? String {
            port = Int(portString)
        } else {
            port = nil
        }

        if let port = port {
            discoveredFailOnDiff = serverInfo["failOnDiff"] as? Bool == true
            let url = "http://localhost:\(port)"
            // Verify server is actually running on this port
            if checkServerReachable(url) {
                return url
            }
        }

        return nil
    }

    private func shouldFailOnDiff() -> Bool {
        if let configuredFailOnDiff = configuredFailOnDiff {
            return configuredFailOnDiff
        }

        let envValue = ProcessInfo.processInfo.environment["VIZZLY_FAIL_ON_DIFF"]?.lowercased()
        return envValue == "true" || envValue == "1" || discoveredFailOnDiff
    }

    private func getBuildId() -> String? {
        // 1. Check environment variable (works for Node.js and other runtimes)
        if let buildId = ProcessInfo.processInfo.environment["VIZZLY_BUILD_ID"] {
            return buildId
        }

        // 2. Check project-local server.json (works for iOS/Swift where env vars don't propagate)
        let fileManager = FileManager.default
        let currentDir = fileManager.currentDirectoryPath
        let localServerFile = (currentDir as NSString).appendingPathComponent(".vizzly/server.json")

        if let buildId = readBuildIdFromFile(localServerFile) {
            return buildId
        }

        // 3. Check global server.json as fallback
        if let homeDir = ProcessInfo.processInfo.environment["HOME"] {
            let globalServerFile = (homeDir as NSString).appendingPathComponent(".vizzly/server.json")
            if let buildId = readBuildIdFromFile(globalServerFile) {
                return buildId
            }
        }

        return nil
    }

    private func readBuildIdFromFile(_ filePath: String) -> String? {
        guard let serverData = try? Data(contentsOf: URL(fileURLWithPath: filePath)),
              let serverInfo = try? JSONSerialization.jsonObject(with: serverData) as? [String: Any],
              let buildId = serverInfo["buildId"] as? String else {
            return nil
        }
        return buildId
    }

    private func checkServerReachable(_ urlString: String) -> Bool {
        guard let url = URL(string: "\(urlString)/health") else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2

        let semaphore = DispatchSemaphore(value: 0)
        var isReachable = false

        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            defer { semaphore.signal() }

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                isReachable = true
            }
        }

        task.resume()
        _ = semaphore.wait(timeout: .now() + 2)

        return isReachable
    }

    private func handleError(name: String, error: Error) {
        print("⚠️  Vizzly screenshot failed for \(name): \(error.localizedDescription)")

        let errorString = error.localizedDescription.lowercased()

        if errorString.contains("connection") || errorString.contains("could not connect") {
            if let serverUrl = serverUrl {
                print("   Server URL: \(serverUrl)/screenshot")
                print("   This usually means the Vizzly server is not running or not accessible")
                print("   Check that the server is started and the port is correct")
            }
        }

        disable(reason: "failure")
    }

    private func handleNonSuccessResponse(statusCode: Int, data: Data, name: String) {
        var errorData: [String: Any] = [:]

        do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                errorData = json
            }
        } catch {
            // Ignore parse errors
        }

        // In TDD mode with visual differences, log but don't disable
        if statusCode == 422,
           let tddMode = errorData["tddMode"] as? Bool,
           tddMode,
           let comparison = errorData["comparison"] as? [String: Any] {

            let diffPercent = (comparison["diffPercentage"] as? Double)?.rounded() ?? 0.0

            // Extract port from serverUrl
            var port = defaultTddPort
            if let serverUrl = serverUrl,
               let range = serverUrl.range(of: ":(\\d+)", options: .regularExpression),
               let portString = serverUrl[range].split(separator: ":").last,
               let parsedPort = Int(portString) {
                port = parsedPort
            }

            let dashboardUrl = "http://localhost:\(port)/dashboard"

            if shouldFailOnDiff() {
                print("❌ Visual diff detected for \"\(comparison["name"] ?? name)\" (\(comparison["diffPercentage"] ?? 0)% difference)")
                disable(reason: "visual diff")
                return
            }

            print("⚠️  Visual diff: \(comparison["name"] ?? name) (\(diffPercent)%) → \(dashboardUrl)")
            return
        }

        // Other errors - disable client
        let errorMessage = errorData["error"] as? String ?? "Unknown error"
        print("❌ Screenshot failed: \(statusCode) - \(errorMessage)")
        disable(reason: "failure")
    }
}
