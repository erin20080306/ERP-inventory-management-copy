import Combine
import Foundation
import WebKit

enum ERPWebNotice: String, Identifiable {
    case medicalUnavailable
    case subscription

    var id: String { rawValue }
}

@MainActor
final class ERPWebViewModel: ObservableObject {
    static let baseURL = URL(string: "https://www.erin-com.com")!
    static let userAgentMarker = "ErinERP-iOS-App/1.0"
    static let platformHeader = "X-Erin-Client-Platform"
    static let platformValue = "ios-app"

    @Published private(set) var currentURL = baseURL
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = false
    @Published var notice: ERPWebNotice?
    @Published var loadError: String?

    weak var webView: WKWebView?

    var initialRequest: URLRequest {
        request(path: "/login?source=ios-app")
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        updateNavigationState(from: webView)
    }

    func request(path: String) -> URLRequest {
        let url = URL(string: path, relativeTo: Self.baseURL) ?? Self.baseURL
        var request = URLRequest(url: url)
        request.setValue(Self.platformValue, forHTTPHeaderField: Self.platformHeader)
        request.cachePolicy = .useProtocolCachePolicy
        return request
    }

    func loadWorkspace() {
        webView?.load(request(path: "/workspace"))
    }

    func reload() {
        loadError = nil
        if let webView {
            webView.reload()
        }
    }

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
    }

    func updateNavigationState(from webView: WKWebView) {
        currentURL = webView.url ?? currentURL
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        isLoading = webView.isLoading
    }
}
