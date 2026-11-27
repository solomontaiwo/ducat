import UIKit
import Capacitor
import WebKit

/// Registers local native plugins bundled with the iOS app and keeps the
/// WebView background adaptive to light/dark system appearance (no white flash
/// on launch or overscroll in Dark Mode).
class MainViewController: CAPBridgeViewController {
    private var pageBackgroundObservation: NSKeyValueObservation?

    override open func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        webView?.isOpaque = false
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = .systemBackground
        // Once the page has a background, the area revealed by a pull (pull to
        // refresh, rubber band) uses the same colour and follows the in-app theme.
        pageBackgroundObservation = webView?.observe(\.underPageBackgroundColor, options: [.new]) { webView, _ in
            DispatchQueue.main.async {
                webView.scrollView.backgroundColor = webView.underPageBackgroundColor
            }
        }
    }

    override open func capacitorDidLoad() {
        // The same iPad binary runs on Apple silicon with a resizable Mac window.
        if ProcessInfo.processInfo.isiOSAppOnMac {
            let script = WKUserScript(
                source: "document.documentElement.dataset.host = 'macos';",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
            webView?.configuration.userContentController.addUserScript(script)
        }
        bridge?.registerPluginInstance(BiometricAuthPlugin())
        bridge?.registerPluginInstance(NativeFeaturesPlugin())
        bridge?.registerPluginInstance(NativeNavigationPlugin())
        bridge?.registerPluginInstance(NativeRefreshPlugin())
    }
}
