#if os(iOS) && targetEnvironment(simulator)
import Darwin
import DeveloperToolsSupport
import Foundation
import SwiftUI
import UIKit

public enum VizzlyPreviewRuntime {
    /// True only while `vizzly previews` is rendering this app in Simulator.
    public static var isCapturing: Bool {
        ProcessInfo.processInfo.environment["VIZZLY_CAPTURE_PLAN_FILENAME"]
            != nil
    }

    /// Enables Vizzly capture when the app is launched by `vizzly previews`.
    @MainActor
    public static func install() {
        startVizzlyPreviewRuntime()
    }
}

@available(iOS 17.0, *)
public typealias VizzlyPreviewBody = @MainActor () -> any View

@available(iOS 17.0, *)
public typealias VizzlyPreviewInitializer = @convention(thin) @MainActor (
    String?,
    [PreviewTrait<Preview.ViewTraits>],
    @escaping VizzlyPreviewBody
) -> Preview

@_silgen_name("VizzlyOriginalPreviewInitializer")
private func originalPreviewInitializerPointer() -> UnsafeRawPointer

@available(iOS 17.0, *)
@MainActor
private var capturedPreviewBody: VizzlyPreviewBody?

@available(iOS 17.0, *)
@MainActor
private var capturedPreviewName = "Unnamed Preview"

@available(iOS 17.0, *)
@MainActor
private var capturedPreviewTraits: [PreviewTrait<Preview.ViewTraits>] = []

@available(iOS 17.0, *)
@MainActor
private var captureTargetView: UIView?

@available(iOS 17.0, *)
@MainActor
private var activationObserver: NSObjectProtocol?

@available(iOS 17.0, *)
@MainActor
private var capturePlan: CapturePlan?

@available(iOS 17.0, *)
@MainActor
private var captureRequestIndex = 0

@available(iOS 17.0, *)
private struct CapturePlan: Decodable {
    let include: String?
    let requests: [CaptureRequest]
}

@available(iOS 17.0, *)
private struct CaptureRequest: Decodable {
    let filename: String
    let registryType: String
}

@_silgen_name("VizzlyPreviewInitializerReplacement")
@available(iOS 17.0, *)
@MainActor
public func interceptPreviewInitializer(
    _ name: String?,
    traits: [PreviewTrait<Preview.ViewTraits>],
    body: @escaping VizzlyPreviewBody
) -> Preview {
    capturedPreviewBody = body
    capturedPreviewName = name ?? "Unnamed Preview"
    capturedPreviewTraits = traits

    let original = unsafeBitCast(
        originalPreviewInitializerPointer(),
        to: VizzlyPreviewInitializer.self
    )
    return original(name, traits, body)
}

@available(iOS 17.0, *)
@MainActor
private func emitEvent(_ event: [String: Any]) {
    guard
        JSONSerialization.isValidJSONObject(event),
        let data = try? JSONSerialization.data(withJSONObject: event),
        let json = String(data: data, encoding: .utf8)
    else {
        return
    }

    print("VIZZLY_PREVIEW_EVENT \(json)")
    fflush(stdout)
}

@available(iOS 17.0, *)
@MainActor
private func loadCapturePlan(from filename: String) throws -> CapturePlan {
    let documentsURL = try FileManager.default.url(
        for: .documentDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
    )
    let data = try Data(
        contentsOf: documentsURL.appendingPathComponent(filename)
    )
    return try JSONDecoder().decode(CapturePlan.self, from: data)
}

@available(iOS 17.0, *)
private func matchesPreviewName(_ name: String, pattern: String?) -> Bool {
    guard let pattern, !pattern.isEmpty else {
        return true
    }

    let expression = pattern
        .components(separatedBy: "*")
        .map(NSRegularExpression.escapedPattern(for:))
        .joined(separator: ".*")
    return name.range(
        of: "^\(expression)$",
        options: [.regularExpression, .caseInsensitive]
    ) != nil
}

@available(iOS 17.0, *)
@MainActor
private func traitNumber(after marker: String, in description: String) -> CGFloat? {
    guard let markerRange = description.range(of: marker) else {
        return nil
    }

    let suffix = description[markerRange.upperBound...]
    let value = suffix.prefix { character in
        character.isNumber || character == "." || character == "-"
    }
    guard let number = Double(value), number > 0 else {
        return nil
    }
    return CGFloat(number)
}

@available(iOS 17.0, *)
@MainActor
private func traitDescriptions(
    _ trait: PreviewTrait<Preview.ViewTraits>
) -> [String] {
    guard
        let traits = Mirror(reflecting: trait).children.first(where: {
            $0.label == "traits"
        })?.value
    else {
        return []
    }

    return Mirror(reflecting: traits).children.map {
        String(reflecting: $0.value)
    }
}

@available(iOS 17.0, *)
@MainActor
private func previewSize(
    for traits: [PreviewTrait<Preview.ViewTraits>],
    screenSize: CGSize
) throws -> CGSize? {
    var requestedSize: CGSize?
    let descriptions = traits.flatMap(traitDescriptions)

    for description in descriptions {
        if description.contains("PreviewLayout.fixed") {
            guard
                let width = traitNumber(
                    after: "PreviewLayout.fixed(width: ",
                    in: description
                ),
                let height = traitNumber(after: ", height: ", in: description)
            else {
                throw PreviewRuntimeError.unsupportedTraits(descriptions.count)
            }
            requestedSize = CGSize(width: width, height: height)
            continue
        }

        if description.contains("PreviewInterfaceOrientation.landscape") {
            requestedSize = requestedSize ?? CGSize(
                width: max(screenSize.width, screenSize.height),
                height: min(screenSize.width, screenSize.height)
            )
            continue
        }

        if description.contains("PreviewInterfaceOrientation.portrait")
            || description.contains("PreviewLayout.device")
        {
            continue
        }

        throw PreviewRuntimeError.unsupportedTraits(descriptions.count)
    }

    guard traits.isEmpty || !descriptions.isEmpty else {
        throw PreviewRuntimeError.unsupportedTraits(traits.count)
    }

    return requestedSize
}

@available(iOS 17.0, *)
private struct ResolvedPreview {
    let size: CGSize?
    let view: AnyView
}

@available(iOS 17.0, *)
@MainActor
private func resolvePreview(
    request: CaptureRequest,
    include: String?,
    screenSize: CGSize
) throws -> ResolvedPreview? {
    capturedPreviewBody = nil
    capturedPreviewName = "Unnamed Preview"
    capturedPreviewTraits = []
    emitEvent([
        "protocolVersion": 1,
        "type": "preview-started",
        "registryType": request.registryType,
    ])

    guard
        let loadedType = _typeByName(request.registryType),
        let registry = loadedType as? any PreviewRegistry.Type
    else {
        throw PreviewRuntimeError.registryUnavailable
    }

    _ = try registry.makePreview()

    guard let body = capturedPreviewBody else {
        throw PreviewRuntimeError.bodyUnavailable
    }

    emitEvent([
        "protocolVersion": 1,
        "type": "preview-discovered",
        "name": capturedPreviewName,
        "registryType": request.registryType,
    ])
    guard matchesPreviewName(capturedPreviewName, pattern: include) else {
        emitEvent([
            "protocolVersion": 1,
            "type": "preview-skipped",
            "name": capturedPreviewName,
            "registryType": request.registryType,
        ])
        return nil
    }

    let size = try previewSize(
        for: capturedPreviewTraits,
        screenSize: screenSize
    )
    let view = body()
    emitEvent([
        "protocolVersion": 1,
        "type": "preview-resolved",
        "name": capturedPreviewName,
        "registryType": request.registryType,
        "traitCount": capturedPreviewTraits.count,
        "viewType": String(reflecting: type(of: view)),
    ])
    return ResolvedPreview(size: size, view: AnyView(view))
}

@available(iOS 17.0, *)
private struct InjectedPreviewRoot: View {
    let preview: AnyView
    let request: CaptureRequest
    let completion: @MainActor (Result<String, Error>) -> Void

    var body: some View {
        preview.background {
            CaptureProbe(request: request, completion: completion)
                .frame(width: 0, height: 0)
        }
    }
}

@available(iOS 17.0, *)
private struct CaptureProbe: UIViewControllerRepresentable {
    let request: CaptureRequest
    let completion: @MainActor (Result<String, Error>) -> Void

    func makeUIViewController(context: Context) -> CaptureController {
        CaptureController(request: request, completion: completion)
    }

    func updateUIViewController(
        _ uiViewController: CaptureController,
        context: Context
    ) {}

    final class CaptureController: UIViewController {
        private var didCapture = false
        private let request: CaptureRequest
        private let completion: @MainActor (Result<String, Error>) -> Void

        init(
            request: CaptureRequest,
            completion: @escaping @MainActor (Result<String, Error>) -> Void
        ) {
            self.request = request
            self.completion = completion
            super.init(nibName: nil, bundle: nil)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) {
            fatalError("init(coder:) has not been implemented")
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard !didCapture else { return }
            didCapture = true

            Task { @MainActor in
                do {
                    completion(.success(try captureWindow()))
                } catch {
                    completion(.failure(error))
                }
            }
        }

        @MainActor
        private func captureWindow() throws -> String {
            flushPendingRenderTransactions()

            guard let targetView = captureTargetView ?? view.window else {
                throw PreviewRuntimeError.windowUnavailable
            }

            targetView.layoutIfNeeded()
            let format = UIGraphicsImageRendererFormat()
            format.scale = targetView.window?.screen.scale ?? UIScreen.main.scale
            format.opaque = true
            let renderer = UIGraphicsImageRenderer(
                bounds: targetView.bounds,
                format: format
            )
            let image = renderer.image { _ in
                targetView.drawHierarchy(
                    in: targetView.bounds,
                    afterScreenUpdates: true
                )
            }

            guard let png = image.pngData() else {
                throw PreviewRuntimeError.pngEncodingFailed
            }

            let documentsURL = try FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            try png.write(
                to: documentsURL.appendingPathComponent(request.filename),
                options: .atomic
            )
            return request.filename
        }

        @MainActor
        private func flushPendingRenderTransactions() {
            CATransaction.flush()
        }
    }
}

@available(iOS 17.0, *)
@MainActor
private func captureNextPreview(in window: UIWindow) {
    guard
        let plan = capturePlan,
        captureRequestIndex < plan.requests.count
    else {
        emitEvent([
            "protocolVersion": 1,
            "type": "batch-complete",
        ])
        exit(EXIT_SUCCESS)
    }

    let request = plan.requests[captureRequestIndex]
    do {
        guard let preview = try resolvePreview(
            request: request,
            include: plan.include,
            screenSize: window.bounds.size
        ) else {
            advanceCapture(after: request, in: window)
            return
        }

        let hostingController = UIHostingController(
            rootView: InjectedPreviewRoot(
                preview: preview.view,
                request: request
            ) { result in
                switch result {
                case .success(let filename):
                    emitEvent([
                        "protocolVersion": 1,
                        "type": "capture-complete",
                        "filename": filename,
                        "registryType": request.registryType,
                    ])
                case .failure(let error):
                    emitFailure(error, registryType: request.registryType)
                }
                advanceCapture(after: request, in: window)
            }
        )
        captureTargetView = nil

        if let size = preview.size {
            let container = UIViewController()
            container.addChild(hostingController)
            container.view.addSubview(hostingController.view)
            hostingController.view.frame = CGRect(origin: .zero, size: size)
            hostingController.didMove(toParent: container)
            captureTargetView = hostingController.view
            window.rootViewController = container
        } else {
            window.rootViewController = hostingController
        }
        window.makeKeyAndVisible()
    } catch {
        emitFailure(error, registryType: request.registryType)
        advanceCapture(after: request, in: window)
    }
}

@available(iOS 17.0, *)
@MainActor
private func advanceCapture(after request: CaptureRequest, in window: UIWindow) {
    guard
        let plan = capturePlan,
        captureRequestIndex < plan.requests.count,
        plan.requests[captureRequestIndex].registryType == request.registryType
    else {
        return
    }

    captureRequestIndex += 1
    Task { @MainActor in
        await Task.yield()
        captureNextPreview(in: window)
    }
}

@available(iOS 17.0, *)
@MainActor
private func emitFailure(_ error: Error, registryType: String? = nil) {
    var event: [String: Any] = [
        "protocolVersion": 1,
        "type": "capture-failed",
        "message": error.localizedDescription,
    ]
    if let registryType {
        event["registryType"] = registryType
    }
    if capturedPreviewBody != nil {
        event["name"] = capturedPreviewName
    }
    emitEvent(event)
}

@available(iOS 17.0, *)
@MainActor
private func startPreviewObservation() {
    guard activationObserver == nil else { return }
    activationObserver = NotificationCenter.default.addObserver(
        forName: UIScene.didActivateNotification,
        object: nil,
        queue: .main
    ) { notification in
        MainActor.assumeIsolated {
            guard let scene = notification.object as? UIWindowScene else {
                return
            }
            guard let window = scene.windows.first(where: \.isKeyWindow)
                ?? scene.windows.first(where: {
                    !$0.isHidden && $0.alpha > 0
                })
                ?? scene.windows.first else {
                emitFailure(PreviewRuntimeError.windowUnavailable)
                exit(EXIT_FAILURE)
            }

            if let observer = activationObserver {
                NotificationCenter.default.removeObserver(observer)
                activationObserver = nil
            }
            captureNextPreview(in: window)
        }
    }
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {
    guard #available(iOS 17.0, *) else {
        return
    }

    guard let filename = ProcessInfo.processInfo.environment[
        "VIZZLY_CAPTURE_PLAN_FILENAME"
    ] else { return }

    MainActor.assumeIsolated {
        do {
            capturePlan = try loadCapturePlan(from: filename)
            startPreviewObservation()
        } catch {
            emitFailure(error)
            exit(EXIT_FAILURE)
        }
    }
}

private enum PreviewRuntimeError: LocalizedError {
    case bodyUnavailable
    case pngEncodingFailed
    case registryUnavailable
    case unsupportedTraits(Int)
    case windowUnavailable

    var errorDescription: String? {
        switch self {
        case .bodyUnavailable:
            return "The #Preview body was not intercepted"
        case .pngEncodingFailed:
            return "The rendered preview could not be encoded as PNG"
        case .registryUnavailable:
            return "The generated #Preview registry could not be loaded"
        case .unsupportedTraits(let count):
            return "This preview uses \(count) trait(s), which are not supported yet"
        case .windowUnavailable:
            return "The app did not create a window for preview capture"
        }
    }
}
#else
public enum VizzlyPreviewRuntime {
    /// Always false outside the iOS Simulator capture runtime.
    public static var isCapturing: Bool { false }

    /// Has no effect outside an iOS Simulator capture launch.
    @MainActor
    public static func install() {
        startVizzlyPreviewRuntime()
    }
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {}
#endif
