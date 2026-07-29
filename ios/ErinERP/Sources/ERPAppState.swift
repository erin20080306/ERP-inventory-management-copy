import Combine
import LocalAuthentication
import Network
import SwiftUI

@MainActor
final class ERPAppState: ObservableObject {
    @Published private(set) var isOnline = true
    @Published private(set) var isLocked = false
    @Published private(set) var biometricLockEnabled: Bool
    @Published var biometricError: String?

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.erincom.erp.network")
    private let biometricSettingKey = "erin.biometric-lock-enabled"

    init() {
        biometricLockEnabled = UserDefaults.standard.bool(forKey: biometricSettingKey)
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async {
                self?.isOnline = online
            }
        }
        monitor.start(queue: monitorQueue)
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            unlockIfNeeded()
        case .background:
            if biometricLockEnabled {
                isLocked = true
            }
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    func setBiometricLockEnabled(_ enabled: Bool) {
        biometricError = nil
        guard enabled else {
            biometricLockEnabled = false
            isLocked = false
            UserDefaults.standard.set(false, forKey: biometricSettingKey)
            return
        }

        authenticate(reason: "啟用 Face ID 以保護 ERP 資料") { [weak self] success, message in
            guard let self else { return }
            if success {
                biometricLockEnabled = true
                isLocked = false
                UserDefaults.standard.set(true, forKey: biometricSettingKey)
            } else {
                biometricError = message
            }
        }
    }

    func unlockIfNeeded() {
        guard biometricLockEnabled else {
            isLocked = false
            return
        }
        isLocked = true
        authenticate(reason: "解鎖 Erin ERP") { [weak self] success, message in
            guard let self else { return }
            isLocked = !success
            if !success {
                biometricError = message
            }
        }
    }

    private func authenticate(
        reason: String,
        completion: @escaping @MainActor (Bool, String?) -> Void
    ) {
        let context = LAContext()
        context.localizedCancelTitle = "取消"
        var evaluationError: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &evaluationError) else {
            completion(false, evaluationError?.localizedDescription ?? "此裝置未設定 Face ID、Touch ID 或密碼")
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                completion(success, error?.localizedDescription)
            }
        }
    }
}
