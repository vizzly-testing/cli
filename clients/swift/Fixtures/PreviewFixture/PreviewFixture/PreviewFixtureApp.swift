import SwiftUI

struct PreviewCard: View {
    let title: String

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color("PreviewAccent"), .indigo],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "sparkles")
                    .font(.system(size: 48, weight: .semibold))
                Text(title)
                    .font(.largeTitle.bold())
                Text("Rendered from the app's existing #Preview")
                    .foregroundStyle(.secondary)
            }
            .padding(30)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28))
            .padding(24)
        }
    }
}

struct StatefulCounter: View {
    @State private var count = 7

    var body: some View {
        VStack(spacing: 20) {
            Text("Count: \(count)")
                .font(.largeTitle.monospacedDigit())
            Button("Increment") {
                count += 1
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

@main
struct PreviewFixtureApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Ordinary app root")
        }
    }
}

#Preview("Card / Dark") {
    PreviewCard(title: "Stock #Preview")
        .preferredColorScheme(.dark)
}

#Preview("Stateful Counter") {
    StatefulCounter()
}
