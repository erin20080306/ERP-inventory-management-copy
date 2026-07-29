import Foundation

enum AppNavigationDestination: Equatable {
    case inApp
    case external
    case medicalUnavailable
    case subscription
}

struct AppNavigationPolicy {
    static let rootDomain = "erin-com.com"

    static func destination(for url: URL) -> AppNavigationDestination {
        guard let scheme = url.scheme?.lowercased() else {
            return .external
        }
        if scheme == "about" {
            return .inApp
        }
        guard scheme == "https" || scheme == "http" else {
            return .external
        }
        guard let host = url.host?.lowercased(),
              host == rootDomain || host.hasSuffix(".\(rootDomain)") else {
            return .external
        }

        let path = url.path
        if path == "/medical"
            || path.hasPrefix("/medical/")
            || path == "/api/medical"
            || path.hasPrefix("/api/medical/")
            || path == "/api/medical-site"
            || path.hasPrefix("/api/medical-site/")
            || path == "/print/medical-receipt"
            || path.hasPrefix("/print/medical-receipt/") {
            return .medicalUnavailable
        }
        if path == "/plans" || path.hasPrefix("/plans/") {
            return .subscription
        }
        return .inApp
    }
}
