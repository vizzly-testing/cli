import Foundation

/// Vizzly visual regression testing client for Swift/iOS
///
/// A lightweight client SDK for capturing screenshots and sending them to Vizzly for visual
/// regression testing. Works with both local TDD mode and cloud builds.
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

    /// Shared singleton instance
    public static let shared = VizzlyClient()

    /// Server URL for screenshot uploads
    public private(set) var serverUrl: String?

    /// Whether the client is disabled (due to errors)
    public private(set) var isDisabled = false

    private var hasWarned = false
    private let defaultTddPort = 47392

    /// Initialize a new Vizzly client
    ///
    /// - Parameter serverUrl: Optional server URL. If not provided, auto-discovery will be used.
    public init(serverUrl: String? = nil) {
        self.serverUrl = serverUrl ?? discoverServerUrl()
    }

    /// Take a screenshot for visual regression testing
    ///
    /// - Parameters:
    ///   - name: Unique name for the screenshot
    ///   - image: PNG image data
    ///   - properties: Additional properties to attach (browser, viewport, etc.)
    ///   - threshold: Pixel difference threshold (0-100)
    ///   - fullPage: Whether this is a full page screenshot
    /// - Returns: Response data if successful, nil otherwise
    @discardableResult
    public func screenshot(
        name: String,
        image: Data,
        properties: [String: Any]? = nil,
        threshold: Int = 0,
        fullPage: Bool = false
    ) -> [String: Any]? {
        guard !isDisabled else { return nil }

        guard let serverUrl = serverUrl else {
            warnOnce("Vizzly client not initialized. Screenshots will be skipped.")
            disable()
            return nil
        }

        // Encode image to base64
        let imageBase64 = image.base64EncodedString()

        // Build payload
        var payload: [String: Any] = [
            "name": name,
            "image": imageBase64,
            "threshold": threshold,
            "fullPage": fullPage
        ]

        if let buildId = ProcessInfo.processInfo.environment["VIZZLY_BUILD_ID"] {
            payload["buildId"] = buildId
        }

        if let properties = properties {
            payload["properties"] = properties
        }

        // Send HTTP request
        guard let url = URL(string: "\(serverUrl)/screenshot") else {
            print("❌ Invalid server URL: \(serverUrl)")
            disable()
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            print("❌ Failed to encode screenshot payload: \(error)")
            return nil
        }

        // Use semaphore for synchronous request (needed in test context)
        let semaphore = DispatchSemaphore(value: 0)
        var result: [String: Any]?

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error = error {
                self.handleError(name: name, error: error)
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid response for screenshot: \(name)")
                self.disable(reason: "failure")
                return
            }

            guard let data = data else {
                print("❌ No data received for screenshot: \(name)")
                self.disable(reason: "failure")
                return
            }

            // Handle non-success responses
            if httpResponse.statusCode != 200 {
                self.handleNonSuccessResponse(
                    statusCode: httpResponse.statusCode,
                    data: data,
                    name: name
                )
                return
            }

            // Parse successful response
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    result = json
                }
            } catch {
                print("⚠️  Failed to parse response for \(name): \(error)")
            }
        }

        task.resume()
        semaphore.wait()

        return result
    }

    /// Flush any pending screenshots (no-op for simple client)
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
            "disabled": isDisabled
        ]

        if let serverUrl = serverUrl {
            info["serverUrl"] = serverUrl
        }

        if let buildId = ProcessInfo.processInfo.environment["VIZZLY_BUILD_ID"] {
            info["buildId"] = buildId
        }

        return info
    }

    // MARK: - Private Methods

    private func warnOnce(_ message: String) {
        guard !hasWarned else { return }
        print("⚠️  \(message)")
        hasWarned = true
    }

    private func discoverServerUrl() -> String? {
        // 1. Check VIZZLY_SERVER_URL environment variable (highest priority, set by CLI or test runner)
        if let envUrl = ProcessInfo.processInfo.environment["VIZZLY_SERVER_URL"] {
            return envUrl
        }

        // 2. Check for global server info written by CLI (supports custom ports)
        if let homeDir = ProcessInfo.processInfo.environment["HOME"] {
            let serverFilePath = (homeDir as NSString).appendingPathComponent(".vizzly/server.json")
            if let serverData = try? Data(contentsOf: URL(fileURLWithPath: serverFilePath)),
               let serverInfo = try? JSONSerialization.jsonObject(with: serverData) as? [String: Any] {

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
                    let url = "http://localhost:\(port)"
                    // Verify server is actually running on this port
                    if checkServerReachable(url) {
                        return url
                    }
                }
            }
        }

        // 3. Try default TDD port as fallback (zero-config for default setup)
        let defaultUrl = "http://localhost:\(defaultTddPort)"
        if checkServerReachable(defaultUrl) {
            return defaultUrl
        }

        return nil
    }

    private func checkServerReachable(_ urlString: String) -> Bool {
        guard let url = URL(string: "\(urlString)/health") else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2

        let semaphore = DispatchSemaphore(value: 0)
        var isReachable = false

        let task = URLSession.shared.dataTask(with: request) { _, response, error in
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

            print("⚠️  Visual diff: \(comparison["name"] ?? name) (\(diffPercent)%) → \(dashboardUrl)")
            return
        }

        // Other errors - disable client
        let errorMessage = errorData["error"] as? String ?? "Unknown error"
        print("❌ Screenshot failed: \(statusCode) - \(errorMessage)")
        disable(reason: "failure")
    }
}
