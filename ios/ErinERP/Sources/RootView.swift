import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appState: ERPAppState
    @StateObject private var webModel = ERPWebViewModel()
    @State private var showingSettings = false
    @State private var showingShareSheet = false

    var body: some View {
        ZStack {
            ERPWebView(model: webModel)
                .ignoresSafeArea(.container, edges: .bottom)

            if let loadError = webModel.loadError, appState.isOnline {
                LoadFailureView(message: loadError, retry: webModel.reload)
            }

            if appState.isLocked {
                LockView(unlock: appState.unlockIfNeeded)
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if !appState.isOnline {
                Label("目前離線，部分內容可能無法使用", systemImage: "wifi.slash")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .foregroundStyle(.white)
                    .background(Color.orange)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            NativeToolbar(
                canGoBack: webModel.canGoBack,
                canGoForward: webModel.canGoForward,
                isLoading: webModel.isLoading,
                goBack: webModel.goBack,
                goForward: webModel.goForward,
                goHome: webModel.loadWorkspace,
                reload: webModel.reload,
                share: { showingShareSheet = true },
                settings: { showingSettings = true }
            )
        }
        .sheet(isPresented: $showingSettings) {
            NativeSettingsView()
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(items: [webModel.currentURL])
                .presentationDetents([.medium, .large])
        }
        .alert(item: $webModel.notice) { notice in
            switch notice {
            case .medicalUnavailable:
                Alert(
                    title: Text("請使用完整網頁版"),
                    message: Text("醫美工作區保留於 Vercel 網頁版與桌面版，iOS App 不顯示此入口。"),
                    dismissButton: .default(Text("知道了"))
                )
            case .subscription:
                Alert(
                    title: Text("App Store 訂閱準備中"),
                    message: Text("iOS 版不會開啟網頁金流。StoreKit 訂閱完成後，將由 Apple 安全處理付款。"),
                    dismissButton: .default(Text("知道了"))
                )
            }
        }
        .animation(.easeInOut(duration: 0.2), value: appState.isLocked)
    }
}

private struct NativeToolbar: View {
    let canGoBack: Bool
    let canGoForward: Bool
    let isLoading: Bool
    let goBack: () -> Void
    let goForward: () -> Void
    let goHome: () -> Void
    let reload: () -> Void
    let share: () -> Void
    let settings: () -> Void

    var body: some View {
        HStack(spacing: 5) {
            ToolbarButton(icon: "chevron.backward", label: "返回", enabled: canGoBack, action: goBack)
            ToolbarButton(icon: "chevron.forward", label: "前進", enabled: canGoForward, action: goForward)
            ToolbarButton(icon: "square.grid.2x2", label: "工作區", action: goHome)
            ToolbarButton(icon: isLoading ? "xmark" : "arrow.clockwise", label: "重新整理", action: reload)
            ToolbarButton(icon: "square.and.arrow.up", label: "分享", action: share)
            ToolbarButton(icon: "gearshape", label: "設定", action: settings)
        }
        .padding(.horizontal, 8)
        .padding(.top, 7)
        .padding(.bottom, 4)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Divider()
        }
    }
}

private struct ToolbarButton: View {
    let icon: String
    let label: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .frame(height: 20)
                Text(label)
                    .font(.system(size: 9, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(enabled ? Color.primary : Color.secondary.opacity(0.45))
        }
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

private struct LockView: View {
    let unlock: () -> Void

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.12, green: 0.09, blue: 0.35), Color(red: 0.03, green: 0.16, blue: 0.18)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(.white)
                Text("Erin ERP 已鎖定")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text("使用 Face ID、Touch ID 或裝置密碼繼續")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.72))
                Button(action: unlock) {
                    Label("解鎖", systemImage: "faceid")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(.white)
                        .foregroundStyle(Color.indigo)
                        .clipShape(Capsule())
                }
            }
            .padding(32)
        }
    }
}

private struct LoadFailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.icloud")
                .font(.system(size: 40))
                .foregroundStyle(.orange)
            Text("內容載入失敗")
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
            Button("重新載入", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: 320)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .shadow(radius: 16)
    }
}
