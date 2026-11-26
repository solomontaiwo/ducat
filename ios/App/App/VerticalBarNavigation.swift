import UIKit
import Capacitor

/// Native navigation for the iPhone Duo outer screen.
///
/// From iOS 27.1 the system can host bar content (tab bar, toolbar items) in a
/// "vertical bar" next to the vertical status bar. A web tab bar cannot go
/// there, so when the system reports a vertical bar the app shows a native
/// tab bar instead and the web app hides its own. Everywhere else (other
/// iPhones, iPad, the Duo inner screen, the web and desktop builds) nothing
/// changes: the controller is only installed once a vertical bar appears, and
/// it keeps its tab bar hidden while there is none.
@available(iOS 27.1, *)
final class VerticalBarTabController: UITabBarController, UITabBarControllerDelegate {
    private struct Destination {
        let identifier: String
        let path: String
        let title: String
        let symbol: String
    }

    private static let destinations = [
        Destination(identifier: "dashboard", path: "/dashboard", title: "Overview", symbol: "house"),
        Destination(identifier: "transactions", path: "/transactions", title: "Transactions", symbol: "list.bullet"),
        Destination(identifier: "analytics", path: "/analytics", title: "Insights", symbol: "chart.bar"),
    ]
    private static let addIdentifier = "add"

    /// The Capacitor bridge: one WebView, moved into the host of the selected tab.
    private let content: UIViewController
    private var hosts: [String: UIViewController] = [:]
    private var webWantsBar = false

    init(content: UIViewController) {
        self.content = content
        super.init(nibName: nil, bundle: nil)
        var tabs = Self.destinations.map { destination -> UITab in
            let host = UIViewController()
            host.view.backgroundColor = .systemBackground
            hosts[destination.identifier] = host
            return UITab(
                title: destination.title,
                image: UIImage(systemName: destination.symbol),
                identifier: destination.identifier
            ) { _ in host }
        }
        // Never selected: tapping it opens the new-transaction form in the web app.
        let addHost = UIViewController()
        tabs.append(UITab(title: "Add", image: UIImage(systemName: "plus"), identifier: Self.addIdentifier) { _ in addHost })
        self.tabs = tabs
        self.prominentTabIdentifier = Self.addIdentifier
        self.delegate = self
        self.isTabBarHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        if let host = selectedTab.flatMap({ hosts[$0.identifier] }) {
            attachContent(to: host)
        }
        registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { (controller: VerticalBarTabController, _) in
            controller.refreshVisibility()
        }
        refreshVisibility()
    }

    // MARK: - Web app state

    var hasVerticalBar: Bool { traitCollection.verticalBarEdge != .unspecified }

    /// Applies the state sent by the web app: whether its navigation is showing
    /// (signed in or demo, no modal open), the current page, the demo badge,
    /// whether a movement can be added, and the translated labels.
    func apply(visible: Bool, path: String?, badge: String?, addEnabled: Bool, labels: [String: String]) {
        for tab in tabs {
            if let label = labels[tab.identifier], !label.isEmpty, tab.title != label { tab.title = label }
        }
        tabs.first { $0.identifier == "transactions" }?.badgeValue = badge
        tabs.first { $0.identifier == Self.addIdentifier }?.isEnabled = addEnabled
        if let path, let destination = Self.destinations.first(where: { $0.path == path }),
           selectedTab?.identifier != destination.identifier,
           let tab = tabs.first(where: { $0.identifier == destination.identifier }),
           let host = hosts[destination.identifier] {
            // Programmatic selection does not call the delegate, so the web app
            // is not asked to navigate again.
            selectedTab = tab
            attachContent(to: host)
        }
        webWantsBar = visible
        refreshVisibility()
    }

    private func refreshVisibility() {
        let show = hasVerticalBar && webWantsBar
        if isTabBarHidden == show { setTabBarHidden(!show, animated: viewIfLoaded?.window != nil) }
        NativeNavigationPlugin.updateAvailability(hasVerticalBar)
    }

    // MARK: - Tab selection

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard tab.identifier == Self.addIdentifier else { return true }
        NativeNavigationPlugin.emit("addRequested", [:])
        return false
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelectTab selectedTab: UITab, previousTab: UITab?) {
        guard let destination = Self.destinations.first(where: { $0.identifier == selectedTab.identifier }),
              let host = hosts[destination.identifier] else { return }
        attachContent(to: host)
        NativeNavigationPlugin.emit("tabSelected", ["path": destination.path])
    }

    /// Moves the WebView's view controller into the given tab host, so every
    /// tab shows the same web app without reloading it.
    private func attachContent(to host: UIViewController) {
        guard content.parent !== host else { return }
        if content.parent != nil {
            content.willMove(toParent: nil)
            content.view.removeFromSuperview()
            content.removeFromParent()
        }
        host.addChild(content)
        content.view.frame = host.view.bounds
        content.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.addSubview(content.view)
        content.didMove(toParent: host)
    }
}

/// Bridge between the native tab bar and the web app.
///
/// JavaScript calls `getState` and `update`; the plugin sends `stateChanged`
/// (`{ available }`), `tabSelected` (`{ path }`) and `addRequested`.
@objc(NativeNavigationPlugin)
public class NativeNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeNavigationPlugin"
    public let jsName = "NativeNavigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
    ]

    private static weak var sharedInstance: NativeNavigationPlugin?
    /// The installed `VerticalBarTabController`, typed loosely because the
    /// class only exists on iOS 27.1 and later.
    static weak var controller: UIViewController?
    private static var available = false

    override public func load() {
        Self.sharedInstance = self
    }

    static func emit(_ event: String, _ data: [String: Any]) {
        DispatchQueue.main.async {
            sharedInstance?.notifyListeners(event, data: data)
        }
    }

    static func updateAvailability(_ value: Bool) {
        guard available != value else { return }
        available = value
        emit("stateChanged", ["available": value])
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["available": Self.available])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        let path = call.getString("path")
        let badge = call.getString("badge")
        let addEnabled = call.getBool("addEnabled") ?? true
        let labels = (call.getObject("labels") ?? [:]).compactMapValues { $0 as? String }
        DispatchQueue.main.async {
            if #available(iOS 27.1, *), let controller = Self.controller as? VerticalBarTabController {
                controller.apply(visible: visible, path: path, badge: badge, addEnabled: addEnabled, labels: labels)
            }
            call.resolve()
        }
    }
}
