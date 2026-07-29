import SwiftUI
import WebKit

struct ERPWebView: UIViewRepresentable {
    @ObservedObject var model: ERPWebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = ERPWebViewModel.userAgentMarker
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let platformScript = WKUserScript(
            source: "window.__ERIN_CLIENT_PLATFORM__ = 'ios-app';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(platformScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        DispatchQueue.main.async {
            model.attach(webView)
            webView.load(model.initialRequest)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.model = model
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var model: ERPWebViewModel

        init(model: ERPWebViewModel) {
            self.model = model
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            model.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                sender.endRefreshing()
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            model.loadError = nil
            model.updateNavigationState(from: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.updateNavigationState(from: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation?,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.loadError = error.localizedDescription
            model.updateNavigationState(from: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation?,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.loadError = error.localizedDescription
            model.updateNavigationState(from: webView)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            switch AppNavigationPolicy.destination(for: url) {
            case .inApp:
                if navigationAction.targetFrame == nil {
                    webView.load(navigationAction.request)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
            case .medicalUnavailable:
                model.notice = .medicalUnavailable
                model.loadWorkspace()
                decisionHandler(.cancel)
            case .subscription:
                model.notice = .subscription
                decisionHandler(.cancel)
            case .external:
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                switch AppNavigationPolicy.destination(for: url) {
                case .inApp:
                    webView.load(navigationAction.request)
                case .medicalUnavailable:
                    model.notice = .medicalUnavailable
                    model.loadWorkspace()
                case .subscription:
                    model.notice = .subscription
                case .external:
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping @MainActor @Sendable () -> Void
        ) {
            let alert = UIAlertController(title: "Erin ERP", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "確定", style: .default) { _ in completionHandler() })
            webView.closestViewController?.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
        ) {
            let alert = UIAlertController(title: "Erin ERP", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "確定", style: .default) { _ in completionHandler(true) })
            webView.closestViewController?.present(alert, animated: true)
        }
    }
}

private extension UIView {
    var closestViewController: UIViewController? {
        sequence(first: next, next: { $0?.next })
            .first { $0 is UIViewController } as? UIViewController
    }
}
