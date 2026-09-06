import SwiftUI
import WebKit

struct TurnstileWebView: NSViewRepresentable {
    let siteKey: String
    var onToken: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onToken: onToken)
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let userContent = config.userContentController
        userContent.add(context.coordinator, name: "turnstileBridge")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        context.coordinator.webView = webView
        load(webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.onToken = onToken
    }

    private func load(_ webView: WKWebView) {
        let html = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
          <style>body{margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100vh;}</style>
        </head>
        <body>
          <div class="cf-turnstile" data-sitekey="\(siteKey)" data-callback="onSuccess" data-theme="auto"></div>
          <script>
            function onSuccess(token) {
              window.webkit.messageHandlers.turnstileBridge.postMessage(token);
            }
          </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "https://bpmedia.net"))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onToken: (String) -> Void
        weak var webView: WKWebView?

        init(onToken: @escaping (String) -> Void) {
            self.onToken = onToken
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if let token = message.body as? String, !token.isEmpty {
                DispatchQueue.main.async { self.onToken(token) }
            }
        }
    }
}
