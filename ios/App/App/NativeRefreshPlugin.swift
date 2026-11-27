import UIKit
import UIKit.UIGestureRecognizerSubclass
import Capacitor

/// Native pull to refresh for the web app: the system `UIRefreshControl`
/// (the one in the App Store and Mail) on the WebView's own scroll view, so the
/// pull, the ticks and the haptic feel exactly like iOS.
///
/// The control never stays in its refreshing state. That state adds a content
/// inset, which WebKit takes for a scroll past the top once the finger lifts:
/// every fixed element (background, tab bar) would drop by the inset. So the
/// control is reset as soon as it fires, while the finger is still down, and
/// `refresh` is sent when the finger lifts; the page then shows its own spinner
/// in the content, so only the content moves, as in the App Store.
///
/// JavaScript turns it on only on pages that can refresh (`setEnabled`). Not
/// used when the iPad app runs on a Mac.
@objc(NativeRefreshPlugin)
public class NativeRefreshPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeRefreshPlugin"
    public let jsName = "NativeRefresh"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
    ]

    private var control: SafeAreaRefreshControl?
    private let liftObserver = TouchLiftObserver()
    /// The pull crossed the threshold; the refresh starts when the finger lifts.
    private var refreshPending = false

    private static var supported: Bool { !ProcessInfo.processInfo.isiOSAppOnMac }

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let offsetX = CGFloat(call.getDouble("offsetX") ?? 0)
        DispatchQueue.main.async {
            guard Self.supported, let scrollView = self.bridge?.webView?.scrollView else {
                call.resolve(["available": false])
                return
            }
            if enabled {
                self.attach(to: scrollView)
                self.control?.horizontalOffset = offsetX
            } else {
                self.detach(from: scrollView)
            }
            call.resolve(["available": true])
        }
    }

    private func attach(to scrollView: UIScrollView) {
        let control = self.control ?? {
            let created = SafeAreaRefreshControl()
            created.addTarget(self, action: #selector(refreshRequested), for: .valueChanged)
            self.control = created
            return created
        }()
        if liftObserver.view !== scrollView {
            liftObserver.onLift = { [weak self] in self?.fingerLifted() }
            scrollView.addGestureRecognizer(liftObserver)
        }
        guard scrollView.refreshControl !== control else { return }
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.refreshControl = control
    }

    private func detach(from scrollView: UIScrollView) {
        guard let control, scrollView.refreshControl === control else { return }
        refreshPending = false
        if control.isRefreshing { control.endRefreshing() }
        scrollView.refreshControl = nil
    }

    /// The pull crossed the threshold (with the haptic). The control is reset
    /// at once, so its inset is gone before the finger lifts.
    @objc private func refreshRequested() {
        control?.endRefreshing()
        let scrollView = control?.superview as? UIScrollView
        if scrollView?.isTracking == true {
            refreshPending = true
        } else {
            notifyListeners("refresh", data: [:])
        }
    }

    private func fingerLifted() {
        guard refreshPending else { return }
        refreshPending = false
        notifyListeners("refresh", data: [:])
    }
}

/// Reports the moment the last finger leaves the scroll view. Touches reach
/// gesture recognizers before the scroll view's pan handler runs, so the
/// refresh control can end before the scroll view starts holding it open. It
/// never recognizes anything and never delays or cancels touches.
final class TouchLiftObserver: UIGestureRecognizer, UIGestureRecognizerDelegate {
    var onLift: (() -> Void)?

    init() {
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        finishIfLifted(event)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        finishIfLifted(event)
    }

    private func finishIfLifted(_ event: UIEvent) {
        let active = event.allTouches?.filter { $0.phase != .ended && $0.phase != .cancelled } ?? []
        guard active.isEmpty else { return }
        onLift?()
        state = .failed
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}

/// The WebView lays the page out under the status bar (`contentInset: never`),
/// so a plain refresh control would draw its spinner behind the Dynamic Island.
/// This one moves its content below the top safe area, centres it over the
/// page content (`horizontalOffset`, set by the web app when a side bar takes
/// part of the width) and stays above the page, which paints a full-screen
/// background of its own.
final class SafeAreaRefreshControl: UIRefreshControl {
    var horizontalOffset: CGFloat = 0 {
        didSet { if horizontalOffset != oldValue { setNeedsLayout() } }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let origin = CGPoint(x: -horizontalOffset, y: -(superview?.safeAreaInsets.top ?? 0))
        if bounds.origin != origin {
            bounds.origin = origin
        }
        superview?.bringSubviewToFront(self)
    }
}
