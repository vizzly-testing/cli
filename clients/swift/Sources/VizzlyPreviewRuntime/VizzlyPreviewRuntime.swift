#if os(iOS) && targetEnvironment(simulator)
import Darwin
import DeveloperToolsSupport
import Foundation
import SwiftUI
import UIKit

public enum VizzlyPreviewRuntime {
    public static func link() {}
}

public typealias VizzlyPreviewBody = @MainActor () -> any View
public typealias VizzlyPreviewInitializer = @convention(thin) @MainActor (
    String?,
    [PreviewTrait<Preview.ViewTraits>],
    @escaping VizzlyPreviewBody
) -> Preview

@_silgen_name("VizzlyOriginalPreviewInitializer")
private func originalPreviewInitializerPointer() -> UnsafeRawPointer

@MainActor
private var capturedPreviewBody: VizzlyPreviewBody?

@MainActor
private var capturedPreviewName = "Unnamed Preview"

private var activationObserver: NSObjectProtocol?

@_silgen_name("VizzlyPreviewInitializerReplacement")
@MainActor
public func interceptPreviewInitializer(
    _ name: String?,
    traits: [PreviewTrait<Preview.ViewTraits>],
    body: @escaping VizzlyPreviewBody
) -> Preview {
    capturedPreviewBody = body
    capturedPreviewName = name ?? "Unnamed Preview"

    let original = unsafeBitCast(
        originalPreviewInitializerPointer(),
        to: VizzlyPreviewInitializer.self
    )
    return original(name, traits, body)
}

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

    guard let body = capturedPreviewBody else {
        throw PreviewRuntimeError.bodyUnavailable
    }

    let view = body()
    emitEvent([
        "protocolVersion": 1,
        "type": "preview-resolved",
        "name": capturedPreviewName,
        "registryType": registryName,
        "viewType": String(reflecting: type(of: view)),
    ])
    return AnyView(view)
}

private struct InjectedPreviewRoot: View {
    let preview: AnyView

    var body: some View {
        preview.background {
            CaptureProbe().frame(width: 0, height: 0)
        }
    }
}

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
            awaitOneRenderPass()

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
        private func awaitOneRenderPass() {
            CATransaction.flush()
        }
    }
}

@MainActor
private func installPreview() {
    do {
        guard
            let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first,
            let window = scene.windows.first
        else {
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

@MainActor
private func emitFailure(_ error: Error) {
    emitEvent([
        "protocolVersion": 1,
        "type": "capture-failed",
        "message": error.localizedDescription,
    ])
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {
    guard
        ProcessInfo.processInfo.environment["VIZZLY_REGISTRY_TYPE"] != nil
    else {
        return
    }

    activationObserver = NotificationCenter.default.addObserver(
        forName: UIScene.didActivateNotification,
        object: nil,
        queue: .main
    ) { _ in
        MainActor.assumeIsolated {
            installPreview()
        }
    }
}

private enum PreviewRuntimeError: LocalizedError {
    case bodyUnavailable
    case pngEncodingFailed
    case registryUnavailable
    case windowUnavailable

    var errorDescription: String? {
        switch self {
        case .bodyUnavailable:
            return "The #Preview body was not intercepted"
        case .pngEncodingFailed:
            return "The rendered preview could not be encoded as PNG"
        case .registryUnavailable:
            return "The generated #Preview registry could not be loaded"
        case .windowUnavailable:
            return "The app did not create a window for preview capture"
        }
    }
}
#else
public enum VizzlyPreviewRuntime {
    public static func link() {}
}

@_cdecl("VizzlyPreviewRuntimeStart")
public func startVizzlyPreviewRuntime() {}
#endif
