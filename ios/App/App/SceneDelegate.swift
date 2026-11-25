import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyBlurView: UIVisualEffectView?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

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
