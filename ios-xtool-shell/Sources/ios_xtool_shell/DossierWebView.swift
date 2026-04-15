import SwiftUI
import UIKit
import WebKit

struct DossierWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        if let indexURL = Bundle.module.url(forResource: "index", withExtension: "html", subdirectory: "WebApp") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        } else {
            let message = """
            <html>
              <body style="margin:0;background:#0b1014;color:#f4f7fb;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center">
                <div>
                  <h1 style="margin:0 0 12px;font-size:28px">Dossier shell is missing its web bundle.</h1>
                  <p style="margin:0;font-size:16px;line-height:1.5">Run <code>npm --prefix frontend run build:ios:shell</code> before building this xtool target.</p>
                </div>
              </body>
            </html>
            """
            webView.loadHTMLString(message, baseURL: nil)
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if url.isFileURL {
            decisionHandler(.allow)
            return
        }

        if ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased()) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url)
        }
        return nil
    }
}
