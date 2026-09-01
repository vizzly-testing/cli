#if os(iOS) && targetEnvironment(simulator)
import Darwin
import DeveloperToolsSupport
import Foundation
import SwiftUI
import UIKit

public enum VizzlyPreviewRuntime {
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
private var capturedPreviewTraitCount = 0

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
    capturedPreviewTraitCount = traits.count

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
private func resolvePreview() throws -> AnyView {
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

    guard capturedPreviewTraitCount == 0 else {
        throw PreviewRuntimeError.unsupportedTraits(capturedPreviewTraitCount)
    }

    guard let body = capturedPreviewBody else {
        throw PreviewRuntimeError.bodyUnavailable
    }

    let view = body()
    emitEvent([
        "protocolVersion": 1,
        "type": "preview-resolved",
        "name": capturedPreviewName,
        "registryType": registryName,
        "traitCount": capturedPreviewTraitCount,
        "viewType": String(reflecting: type(of: view)),
    ])
    return AnyView(view)
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

            guard let window = view.window else {
                throw PreviewRuntimeError.windowUnavailable
            }

            window.layoutIfNeeded()
            let format = UIGraphicsImageRendererFormat()
            format.scale = window.screen.scale
            format.opaque = true
            let renderer = UIGraphicsImageRenderer(
                bounds: window.bounds,
                format: format
            )
            let image = renderer.image { _ in
                window.drawHierarchy(
                    in: window.bounds,
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

        let preview = try resolvePreview()
        window.rootViewController = UIHostingController(
            rootView: InjectedPreviewRoot(preview: preview)
        )
        window.makeKeyAndVisible()
    } catch {
        emitFailure(error)
        exit(EXIT_FAILURE)
    }
}

@available(iOS 17.0, *)
@MainActor
private func emitFailure(_ error: Error) {
    emitEvent([
        "protocolVersion": 1,
        "type": "capture-failed",
        "message": error.localizedDescription,
    ])
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
    guard
        ProcessInfo.processInfo.environment["VIZZLY_REGISTRY_TYPE"] != nil,
        #available(iOS 17.0, *)
    else {
        return
    }

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
    /// Has no effect outside an iOS Simulator capture launch.
    @MainActor
    public static func install() {
        startVizzlyPreviewRuntime()
    }
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {}
#endif
