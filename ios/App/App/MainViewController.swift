import UIKit
import Capacitor
import WebKit

/// Registers local native plugins bundled with the iOS app, keeps the WebView
/// background adaptive to light/dark system appearance, and reports iPhone Duo
/// top-corner bar geometry (when the system status/battery cluster occupies
/// only the top-right corner) so page titles and actions can live in the top
/// strip beside it.
class MainViewController: CAPBridgeViewController {
    private struct TopCornerBarMetrics: Equatable {
        let active: Bool
        let top: Int
        let left: Int
        let right: Int
        let height: Int

        static let inactive = TopCornerBarMetrics(active: false, top: 0, left: 0, right: 0, height: 0)
    }

    private var pageBackgroundObservation: NSKeyValueObservation?
    private var webViewLoadingObservation: NSKeyValueObservation?
    private var lastAppliedMetrics: TopCornerBarMetrics?
    private var topBarRegionObserver: UIView?

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
        webViewLoadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard change.newValue == false else { return }
            DispatchQueue.main.async {
                self?.syncTopCornerBarMetrics(force: true)
            }
        }
        if #available(iOS 27.1, *) {
            installTopBarRegionObserver()
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { (controller: MainViewController, _) in
                controller.syncTopCornerBarMetrics()
            }
        }
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        syncTopCornerBarMetrics()
    }

    override open func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        syncTopCornerBarMetrics()
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

    /// Attaches a hidden, non-interactive probe view to the system top bar
    /// layout guide so Auto Layout re-runs `viewDidLayoutSubviews` whenever
    /// the top-right status/Dynamic Island cluster changes width (e.g. when a
    /// Live Activity appears or expands).
    @available(iOS 27.1, *)
    private func installTopBarRegionObserver() {
        guard topBarRegionObserver == nil else { return }
        let guide: UILayoutGuide
        if #available(iOS 27.2, *) {
            guide = view.layoutGuide(for: .bar(onEdge: UIRectEdge.top))
        } else {
            guide = view.layoutGuide(for: .bar(onEdge: UIRectEdge.top, extent: 52))
        }
        let probe = UIView()
        probe.translatesAutoresizingMaskIntoConstraints = false
        probe.isHidden = true
        probe.isUserInteractionEnabled = false
        view.addSubview(probe)
        NSLayoutConstraint.activate([
            probe.topAnchor.constraint(equalTo: guide.topAnchor),
            probe.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            probe.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            probe.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
        ])
        topBarRegionObserver = probe
    }

    private func computeTopCornerBarMetrics() -> TopCornerBarMetrics {
        guard !ProcessInfo.processInfo.isiOSAppOnMac else { return .inactive }
        guard #available(iOS 27.1, *) else { return .inactive }
        guard traitCollection.verticalBarEdge == .unspecified else { return .inactive }
        let width = view.bounds.width
        guard width > 0, width < 768 else { return .inactive }

        let barInsets: UIEdgeInsets
        if #available(iOS 27.2, *) {
            barInsets = view.edgeInsets(for: .bar(onEdge: UIRectEdge.top))
        } else {
            barInsets = view.edgeInsets(for: .bar(onEdge: UIRectEdge.top, extent: 52))
        }

        let topRightOcclusions = view.reservedRegions(kind: .occlusion).filter { region in
            region.isActive
                && region.frame.minY <= 48
                && region.frame.maxY > 20
                && region.frame.maxY <= 120
                && region.frame.maxX >= width - 48
                && region.frame.minX >= 220
        }

        let occlusionRight = topRightOcclusions.map { max(0, width - $0.frame.minX) }.max() ?? 0
        let occlusionTop = topRightOcclusions.map { max(0, $0.frame.minY + $0.margins.top) }.min()
        let occlusionBottom = topRightOcclusions.map { $0.frame.maxY }.max()

        let rightInset = max(barInsets.right, occlusionRight)
        let leftInset = max(barInsets.left, 16)

        // Only activate when the top bar has a strongly asymmetric right-only
        // status cluster (iPhone Duo inner screen in portrait) with ample room
        // on the left for the page title and actions.
        let asymmetricRightCluster = (rightInset - barInsets.left) >= 80
        let availableWidth = width - leftInset - rightInset
        guard asymmetricRightCluster, availableWidth >= 260 else { return .inactive }

        let safeTop = view.safeAreaInsets.top
        let rawHeight = max(occlusionBottom ?? 0, safeTop, 64)
        let barHeight = max(64, min(88, Int(round(rawHeight))))
        let topPad = max(14, min(26, Int(round(occlusionTop ?? max(CGFloat(barHeight) - 48, 16)))))
        let rightPad = Int(ceil(rightInset)) + 8
        let leftPad = Int(ceil(leftInset))

        return TopCornerBarMetrics(
            active: true,
            top: topPad,
            left: leftPad,
            right: rightPad,
            height: barHeight
        )
    }

    private func syncTopCornerBarMetrics(force: Bool = false) {
        let metrics = computeTopCornerBarMetrics()
        guard force || metrics != lastAppliedMetrics else { return }
        lastAppliedMetrics = metrics
        let script: String
        if metrics.active {
            script = """
            (function(){
              var r = document.documentElement;
              r.dataset.topCornerBar = 'true';
              r.style.setProperty('--top-bar-top', '\(metrics.top)px');
              r.style.setProperty('--top-bar-left', '\(metrics.left)px');
              r.style.setProperty('--top-bar-right', '\(metrics.right)px');
              r.style.setProperty('--top-bar-height', '\(metrics.height)px');
            })();
            """
        } else {
            script = """
            (function(){
              var r = document.documentElement;
              delete r.dataset.topCornerBar;
              r.style.removeProperty('--top-bar-top');
              r.style.removeProperty('--top-bar-left');
              r.style.removeProperty('--top-bar-right');
              r.style.removeProperty('--top-bar-height');
            })();
            """
        }
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }
}
