#if os(iOS) && targetEnvironment(simulator)
import Darwin
import DeveloperToolsSupport
import Foundation
import SwiftUI
import UIKit

public enum VizzlyPreviewRuntime {
    /// True only while `vizzly previews` is rendering this app in Simulator.
    public static var isCapturing: Bool {
        let environment = ProcessInfo.processInfo.environment
        return environment["VIZZLY_REGISTRY_TYPE"] != nil
            || environment["VIZZLY_DISCOVERY_FILENAME"] != nil
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
private var didInstallPreview = false

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
private func discoverPreviews(from filename: String) {
    do {
        let documentsURL = try FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let data = try Data(
            contentsOf: documentsURL.appendingPathComponent(filename)
        )
        let registryNames = try JSONDecoder().decode([String].self, from: data)
        var discoveredCount = 0

        for registryName in registryNames {
            capturedPreviewBody = nil
            capturedPreviewName = "Unnamed Preview"
            capturedPreviewTraits = []

            do {
                guard
                    let loadedType = _typeByName(registryName),
                    let registry = loadedType as? any PreviewRegistry.Type
                else {
                    throw PreviewRuntimeError.registryUnavailable
                }

                _ = try registry.makePreview()
                guard capturedPreviewBody != nil else {
                    throw PreviewRuntimeError.bodyUnavailable
                }
                discoveredCount += 1
                emitEvent([
                    "protocolVersion": 1,
                    "type": "preview-discovered",
                    "name": capturedPreviewName,
                    "registryType": registryName,
                ])
            } catch {
                emitEvent([
                    "protocolVersion": 1,
                    "type": "preview-discovery-failed",
                    "registryType": registryName,
                    "message": error.localizedDescription,
                ])
            }
        }

        emitEvent([
            "protocolVersion": 1,
            "type": "discovery-complete",
            "discovered": discoveredCount,
        ])
        exit(EXIT_SUCCESS)
    } catch {
        emitFailure(error)
        exit(EXIT_FAILURE)
    }
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
private func resolvePreview(screenSize: CGSize) throws -> ResolvedPreview {
    guard
        let registryName = ProcessInfo.processInfo.environment[
            "VIZZLY_REGISTRY_TYPE"
        ],
        let loadedType = _typeByName(registryName),
        let registry = loadedType as? any PreviewRegistry.Type
    else {
        throw PreviewRuntimeError.registryUnavailable
    }

    _ = try registry.makePreview()

    guard let body = capturedPreviewBody else {
        throw PreviewRuntimeError.bodyUnavailable
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
        "registryType": registryName,
        "traitCount": capturedPreviewTraits.count,
        "viewType": String(reflecting: type(of: view)),
    ])
    return ResolvedPreview(size: size, view: AnyView(view))
}

@available(iOS 17.0, *)
private struct InjectedPreviewRoot: View {
    let preview: AnyView

    var body: some View {
        preview.background {
            CaptureProbe().frame(width: 0, height: 0)
        }
    }
}

@available(iOS 17.0, *)
private struct CaptureProbe: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CaptureController {
        CaptureController()
    }

    func updateUIViewController(
        _ uiViewController: CaptureController,
        context: Context
    ) {}

    final class CaptureController: UIViewController {
        private var didCapture = false

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard !didCapture else { return }
            didCapture = true

            Task { @MainActor in
                do {
                    let filename = try captureWindow()
                    emitEvent([
                        "protocolVersion": 1,
                        "type": "capture-complete",
                        "filename": filename,
                    ])
                    exit(EXIT_SUCCESS)
                } catch {
                    emitFailure(error)
                    exit(EXIT_FAILURE)
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

            let filename = ProcessInfo.processInfo.environment[
                "VIZZLY_OUTPUT_FILENAME"
            ] ?? "vizzly-preview.png"
            let documentsURL = try FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            try png.write(
                to: documentsURL.appendingPathComponent(filename),
                options: .atomic
            )
            return filename
        }

        @MainActor
        private func flushPendingRenderTransactions() {
            CATransaction.flush()
        }
    }
}

@available(iOS 17.0, *)
@MainActor
private func installPreview(in scene: UIWindowScene) {
    guard !didInstallPreview else { return }
    didInstallPreview = true

    if let observer = activationObserver {
        NotificationCenter.default.removeObserver(observer)
        activationObserver = nil
    }

    do {
        guard let window = scene.windows.first(where: \.isKeyWindow)
            ?? scene.windows.first(where: { !$0.isHidden && $0.alpha > 0 })
            ?? scene.windows.first else {
            throw PreviewRuntimeError.windowUnavailable
        }

        let preview = try resolvePreview(screenSize: window.bounds.size)
        let hostingController = UIHostingController(
            rootView: InjectedPreviewRoot(preview: preview.view)
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
        emitFailure(error)
        exit(EXIT_FAILURE)
    }
}

@available(iOS 17.0, *)
@MainActor
private func emitFailure(_ error: Error) {
    var event: [String: Any] = [
        "protocolVersion": 1,
        "type": "capture-failed",
        "message": error.localizedDescription,
    ]
    if capturedPreviewBody != nil {
        event["name"] = capturedPreviewName
    }
    emitEvent(event)
}

@available(iOS 17.0, *)
@MainActor
private func startPreviewObservation() {
    guard activationObserver == nil, !didInstallPreview else { return }
    activationObserver = NotificationCenter.default.addObserver(
        forName: UIScene.didActivateNotification,
        object: nil,
        queue: .main
    ) { notification in
        MainActor.assumeIsolated {
            guard let scene = notification.object as? UIWindowScene else {
                return
            }
            installPreview(in: scene)
        }
    }
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {
    guard #available(iOS 17.0, *) else {
        return
    }

    let environment = ProcessInfo.processInfo.environment
    if let filename = environment["VIZZLY_DISCOVERY_FILENAME"] {
        MainActor.assumeIsolated {
            discoverPreviews(from: filename)
        }
        return
    }

    guard environment["VIZZLY_REGISTRY_TYPE"] != nil else { return }

    MainActor.assumeIsolated {
        startPreviewObservation()
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
