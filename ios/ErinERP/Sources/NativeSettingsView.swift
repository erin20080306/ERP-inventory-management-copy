import SwiftUI

struct NativeSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var appState: ERPAppState

    var body: some View {
        NavigationStack {
            Form {
                Section("安全性") {
                    Button {
                        appState.setBiometricLockEnabled(!appState.biometricLockEnabled)
                    } label: {
                        HStack {
                            Label("使用 Face ID／裝置密碼鎖定", systemImage: "lock.shield")
                            Spacer()
                            Image(systemName: appState.biometricLockEnabled ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(appState.biometricLockEnabled ? Color.green : Color.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                    if let error = appState.biometricError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("連線") {
                    LabeledContent("服務網址", value: "www.erin-com.com")
                    LabeledContent("目前狀態", value: appState.isOnline ? "已連線" : "離線")
                }

                Section("法律與支援") {
                    Button("隱私權政策") {
                        openURL(URL(string: "https://www.erin-com.com/privacy")!)
                    }
                    Button("服務條款") {
                        openURL(URL(string: "https://www.erin-com.com/terms")!)
                    }
                }

                Section {
                    LabeledContent("版本", value: appVersion)
                } footer: {
                    Text("完整 ERP 網頁版仍可透過 Safari 與桌面瀏覽器使用。")
                }
            }
            .navigationTitle("App 設定")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }
}
