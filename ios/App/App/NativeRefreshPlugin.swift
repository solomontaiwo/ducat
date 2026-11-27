import UIKit
import Capacitor

/// Native pull to refresh for the web app: the system `UIRefreshControl`
/// (the one in the App Store and Mail) on the WebView's own scroll view, so the
/// pull, the ticks, the haptic and the spinner feel exactly like iOS.
///
/// JavaScript turns it on only on pages that can refresh (`setEnabled`), hears
/// `refresh` when the user pulls far enough, and calls `endRefreshing` once the
/// data is back. Not used when the iPad app runs on a Mac.
@objc(NativeRefreshPlugin)
public class NativeRefreshPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeRefreshPlugin"
    public let jsName = "NativeRefresh"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRefreshing", returnType: CAPPluginReturnPromise),
    ]

    private var control: SafeAreaRefreshControl?

    private static var supported: Bool { !ProcessInfo.processInfo.isiOSAppOnMac }

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            guard Self.supported, let scrollView = self.bridge?.webView?.scrollView else {
                call.resolve(["available": false])
                return
            }
            if enabled {
                self.attach(to: scrollView)
            } else {
                self.detach(from: scrollView)
            }
            call.resolve(["available": true])
        }
    }

    @objc func endRefreshing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.control?.endRefreshing()
            call.resolve()
        }
    }

    private func attach(to scrollView: UIScrollView) {
        let control = self.control ?? {
            let created = SafeAreaRefreshControl()
            created.addTarget(self, action: #selector(refreshRequested), for: .valueChanged)
            self.control = created
            return created
        }()
        guard scrollView.refreshControl !== control else { return }
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.refreshControl = control
    }

    private func detach(from scrollView: UIScrollView) {
        guard let control, scrollView.refreshControl === control else { return }
        if control.isRefreshing { control.endRefreshing() }
        scrollView.refreshControl = nil
    }

    @objc private func refreshRequested() {
        notifyListeners("refresh", data: [:])
    }
}

/// The WebView lays the page out under the status bar (`contentInset: never`),
/// so a plain refresh control would draw its spinner behind the Dynamic Island.
/// This one moves its content below the top safe area and stays above the
/// page, which paints a full-screen background of its own.
final class SafeAreaRefreshControl: UIRefreshControl {
    override func layoutSubviews() {
        super.layoutSubviews()
        let top = superview?.safeAreaInsets.top ?? 0
        if bounds.origin.y != -top {
            bounds.origin.y = -top
        }
        superview?.bringSubviewToFront(self)
    }
}
