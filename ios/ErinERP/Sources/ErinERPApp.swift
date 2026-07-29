import SwiftUI

@main
struct ErinERPApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var appState = ERPAppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
        }
        .onChange(of: scenePhase) { _, newPhase in
            appState.handleScenePhase(newPhase)
        }
    }
}
