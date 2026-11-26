import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyBlurView: UIVisualEffectView?
    /// A `UITraitChangeRegistration` (iOS 17+), kept untyped for iOS 15 builds.
    private var verticalBarRegistration: Any?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        if #available(iOS 27.1, *) {
            observeVerticalBar(in: windowScene)
        }

        if let shortcutItem = connectionOptions.shortcutItem {
            handleShortcut(shortcutItem)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(handleShortcut(shortcutItem))
    }

    @discardableResult
    private func handleShortcut(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
        switch shortcutItem.type {
        case "app.ducat.quick-expense":
            NativeFeaturesPlugin.enqueueRoute("/dashboard?quickAdd=1&type=expense")
            return true
        case "app.ducat.quick-income":
            NativeFeaturesPlugin.enqueueRoute("/dashboard?quickAdd=1&type=income")
            return true
        default:
            return false
        }
    }

    /// Installs the native tab bar the first time the system offers a vertical
    /// bar (iPhone Duo outer screen). Devices without one never get it.
    @available(iOS 27.1, *)
    private func observeVerticalBar(in windowScene: UIWindowScene) {
        installVerticalBarNavigationIfNeeded(windowScene)
        guard NativeNavigationPlugin.controller == nil else { return }
        verticalBarRegistration = windowScene.registerForTraitChanges(
            UITraitCollection.systemTraitsAffectingVerticalBarEdge
        ) { [weak self] (scene: UIWindowScene, _) in
            self?.installVerticalBarNavigationIfNeeded(scene)
        }
    }

    @available(iOS 27.1, *)
    private func installVerticalBarNavigationIfNeeded(_ windowScene: UIWindowScene) {
        guard NativeNavigationPlugin.controller == nil,
              windowScene.traitCollection.verticalBarEdge != .unspecified,
              let window, let main = window.rootViewController as? MainViewController else { return }
        let tabController = VerticalBarTabController(content: main)
        NativeNavigationPlugin.controller = tabController
        window.rootViewController = tabController
        if let registration = verticalBarRegistration as? any UITraitChangeRegistration {
            windowScene.unregisterForTraitChanges(registration)
            verticalBarRegistration = nil
        }
    }

    func sceneWillResignActive(_ scene: UIScene) {
        showPrivacyOverlay()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        showPrivacyOverlay()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        hidePrivacyOverlay()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func showPrivacyOverlay() {
        guard let window = window, privacyBlurView == nil else { return }
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
        blur.frame = window.bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        blur.accessibilityIdentifier = "ducat-privacy-overlay"
        window.addSubview(blur)
        privacyBlurView = blur
    }

    private func hidePrivacyOverlay() {
        guard let blur = privacyBlurView else { return }
        privacyBlurView = nil
        UIView.animate(withDuration: 0.16, animations: {
            blur.alpha = 0
        }, completion: { _ in
            blur.removeFromSuperview()
        })
    }
}
