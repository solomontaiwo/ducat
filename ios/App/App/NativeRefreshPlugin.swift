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
/// `refresh` is sent when the finger lifts, with where the spinner is on
/// screen. The control then fades out while the page shows its own spinner in
/// that same place and holds the content below it, so the spinner seems to
/// stay put and only the content moves, as in the App Store.
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
        let centerX = call.getDouble("centerX").map { CGFloat($0) }
        DispatchQueue.main.async {
            guard Self.supported, let scrollView = self.bridge?.webView?.scrollView else {
                call.resolve(["available": false])
                return
            }
            if enabled {
                self.attach(to: scrollView)
                self.control?.pageCenterX = centerX
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
            liftObserver.onTouch = { [weak self] in self?.control?.reveal() }
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
        control.reveal()
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
            startRefresh()
        }
    }

    private func fingerLifted() {
        guard refreshPending else { return }
        refreshPending = false
        startRefresh()
    }

    /// The page takes over with its own spinner, in the same place, while the
    /// content springs back.
    private func startRefresh() {
        var data: [String: Any] = [:]
        if let centre = control?.spinnerCentre(in: bridge?.webView) {
            data["x"] = Double(centre.x)
            data["y"] = Double(centre.y)
        }
        control?.hideUntilNextTouch()
        notifyListeners("refresh", data: data)
    }
}

/// Reports when a finger first touches the scroll view and when the last one
/// leaves it. Touches reach gesture recognizers before the scroll view's pan
/// handler runs, so the refresh control can end before the scroll view starts
/// holding it open. It never recognizes anything and never delays or cancels
/// touches.
final class TouchLiftObserver: UIGestureRecognizer, UIGestureRecognizerDelegate {
    var onTouch: (() -> Void)?
    var onLift: (() -> Void)?

    init() {
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        onTouch?()
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
/// page content (`pageCenterX`, from the web app: a side bar can take part of
/// the width) and stays above the page, which paints a full-screen background
/// of its own.
final class SafeAreaRefreshControl: UIRefreshControl {
    var pageCenterX: CGFloat? {
        didSet { if pageCenterX != oldValue { setNeedsLayout() } }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let top = -(superview?.safeAreaInsets.top ?? 0)
        if bounds.origin.y != top {
            bounds.origin.y = top
        }
        // The control centres its spinner within the safe area (which leaves
        // out the status bar on the side of the iPhone Duo's inner screen), so
        // its content moves by the distance from there to the page's centre.
        let insets = safeAreaInsets
        let spinnerX = insets.left + (bounds.width - insets.left - insets.right) / 2
        let centreX = bounds.midX + (pageCenterX.map { $0 - spinnerX } ?? 0)
        for view in subviews where view.center.x != centreX {
            view.center.x = centreX
        }
        superview?.bringSubviewToFront(self)
    }

    /// The spinner's centre in `view`, so the page can show its own spinner in
    /// the same place. Nil if the control's layout is not the expected one.
    func spinnerCentre(in view: UIView?) -> CGPoint? {
        guard let view, let spinner = subviews.first?.subviews.first,
              spinner.bounds.width > 0, spinner.bounds.width <= 120, spinner.bounds.height <= 120 else { return nil }
        return spinner.convert(CGPoint(x: spinner.bounds.midX, y: spinner.bounds.midY), to: view)
    }

    /// Fades the spinner out while the page's own takes its place.
    func hideUntilNextTouch() {
        UIView.animate(withDuration: 0.2, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.alpha = 0
        }
    }

    /// Shows the spinner again for the next pull.
    func reveal() {
        guard alpha < 1 else { return }
        layer.removeAllAnimations()
        alpha = 1
    }
}
