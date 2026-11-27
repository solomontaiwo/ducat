import Foundation
import LocalAuthentication
import Security
import StoreKit
import UIKit
import UserNotifications
import Capacitor

/// Local Capacitor plugin for lightweight iOS-native capabilities that need no
/// external dependencies:
/// - `UNUserNotificationCenter` local reminders for upcoming recurring rules
///   (with foreground presentation and tap-to-route handling);
/// - `SKStoreReviewController` in-app App Store review prompt;
/// - `UIWindow.overrideUserInterfaceStyle` sync so native bars, pickers and
///   keyboards match the in-app Light / Dark theme;
/// - Keychain storage for Supabase sessions and protected archive keys.
@objc(NativeFeaturesPlugin)
public class NativeFeaturesPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "NativeFeaturesPlugin"
    public let jsName = "NativeFeatures"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncRecurringReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearRecurringReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAppReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "archiveKeyStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockArchiveKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveArchiveKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeArchiveKey", returnType: CAPPluginReturnPromise),
    ]

    private static let reminderPrefix = "ducat-rec-"
    private static let keychainService = "com.ducatapp.ducat.auth"
    private static let maxReminders = 40
    private static weak var sharedInstance: NativeFeaturesPlugin?
    private static var queuedRoute: String?

    override public func load() {
        Self.sharedInstance = self
        UNUserNotificationCenter.current().delegate = self
    }

    /// Routes an iOS Home Screen Quick Action or notification tap into the SPA.
    public static func enqueueRoute(_ route: String) {
        DispatchQueue.main.async {
            queuedRoute = route
            sharedInstance?.notifyListeners("reminderTapped", data: ["route": route])
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .list])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let request = response.notification.request
        if request.identifier.hasPrefix(Self.reminderPrefix) {
            let route = (request.content.userInfo["route"] as? String) ?? "/recurring"
            Self.enqueueRoute(route)
        }
        completionHandler()
    }

    @objc func consumePendingRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let route = Self.queuedRoute
            Self.queuedRoute = nil
            call.resolve(["route": route as Any])
        }
    }

    @objc func getNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                status = "granted"
            case .denied:
                status = "denied"
            default:
                status = "prompt"
            }
            call.resolve(["status": status])
        }
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                call.reject(error.localizedDescription, "permissionError", error)
                return
            }
            call.resolve(["granted": granted])
        }
    }

    @objc func syncRecurringReminders(_ call: CAPPluginCall) {
        let items = call.getArray("reminders", JSObject.self) ?? []
        let center = UNUserNotificationCenter.current()

        center.getPendingNotificationRequests { requests in
            let oldIds = requests
                .map { $0.identifier }
                .filter { $0.hasPrefix(Self.reminderPrefix) }
            if !oldIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: oldIds)
            }

            let capped = Array(items.prefix(Self.maxReminders))
            let group = DispatchGroup()
            var scheduled = 0

            for item in capped {
                guard let id = item["id"] as? String,
                      let title = item["title"] as? String,
                      let body = item["body"] as? String,
                      let year = item["year"] as? Int,
                      let month = item["month"] as? Int,
                      let day = item["day"] as? Int else {
                    continue
                }

                let hour = (item["hour"] as? Int) ?? 9
                let minute = (item["minute"] as? Int) ?? 0

                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                content.userInfo = ["route": "/recurring"]

                var components = DateComponents()
                components.year = year
                components.month = month
                components.day = day
                components.hour = hour
                components.minute = minute

                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                let request = UNNotificationRequest(
                    identifier: "\(Self.reminderPrefix)\(id)",
                    content: content,
                    trigger: trigger
                )

                group.enter()
                center.add(request) { error in
                    DispatchQueue.main.async {
                        if error == nil {
                            scheduled += 1
                        }
                        group.leave()
                    }
                }
            }

            group.notify(queue: .main) {
                call.resolve(["scheduled": scheduled])
            }
        }
    }

    @objc func clearRecurringReminders(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests
                .map { $0.identifier }
                .filter { $0.hasPrefix(Self.reminderPrefix) }
            if !ids.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: ids)
            }
            call.resolve(["cleared": ids.count])
        }
    }

    @objc func requestAppReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let activeScene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            guard let scene = activeScene else {
                call.resolve(["requested": false])
                return
            }
            SKStoreReviewController.requestReview(in: scene)
            call.resolve(["requested": true])
        }
    }

    /// Keeps native UI (vertical tab bar, keyboard, share sheet, privacy blur)
    /// aligned with the user's in-app Light / Dark / System preference.
    @objc func setAppearance(_ call: CAPPluginCall) {
        let theme = call.getString("theme") ?? "system"
        let style: UIUserInterfaceStyle
        switch theme {
        case "dark":
            style = .dark
        case "light":
            style = .light
        default:
            style = .unspecified
        }
        DispatchQueue.main.async {
            for scene in UIApplication.shared.connectedScenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for window in windowScene.windows {
                    window.overrideUserInterfaceStyle = style
                }
            }
            call.resolve()
        }
    }

    @objc func getSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.resolve(["value": NSNull()])
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc func setSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let value = call.getString("value"),
              let data = value.data(using: .utf8) else {
            call.reject("Invalid secret payload", "invalidArgument")
            return
        }
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: key,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery.merge(attributes) { _, new in new }
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            if addStatus != errSecSuccess {
                call.reject("Keychain save failed (\(addStatus))", "keychainError")
                return
            }
        } else if updateStatus != errSecSuccess {
            call.reject("Keychain update failed (\(updateStatus))", "keychainError")
            return
        }
        call.resolve()
    }

    @objc func removeSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.resolve()
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        call.resolve()
    }

    // The archive has its own service so its access policy can't affect session tokens.
    private static func archiveQuery(_ call: CAPPluginCall) -> [String: Any]? {
        guard let uid = call.getString("uid"), UUID(uuidString: uid) != nil else {
            call.reject("Invalid archive account", "invalidArgument")
            return nil
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.ducatapp.ducat.archive",
            kSecAttrAccount as String: uid,
            kSecAttrSynchronizable as String: false,
        ]
    }

    @objc func archiveKeyStatus(_ call: CAPPluginCall) {
        guard let baseQuery = Self.archiveQuery(call) else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            var query = baseQuery
            let context = LAContext()
            let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
            context.interactionNotAllowed = true
            query[kSecUseAuthenticationContext as String] = context
            let status = SecItemCopyMatching(query as CFDictionary, nil)
            call.resolve([
                "available": available && (status == errSecSuccess || status == errSecItemNotFound || status == errSecInteractionNotAllowed),
                "configured": available && (status == errSecSuccess || status == errSecInteractionNotAllowed),
            ])
        }
    }

    @objc func unlockArchiveKey(_ call: CAPPluginCall) {
        guard let baseQuery = Self.archiveQuery(call) else { return }
        let reason = call.getString("reason") ?? "Unlock your Ducat archive"
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { authenticated, error in
            guard authenticated else {
                switch (error as? LAError)?.code {
                case .userCancel, .systemCancel, .appCancel:
                    call.reject("Authentication cancelled", "userCancel")
                default:
                    call.reject("Archive authentication failed", "keychainError")
                }
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                var query = baseQuery
                query[kSecUseAuthenticationContext as String] = context
                query[kSecReturnData as String] = true
                var result: CFTypeRef?
                let status = SecItemCopyMatching(query as CFDictionary, &result)
                switch status {
                case errSecSuccess:
                    guard let data = result as? Data, data.count == 32 else {
                        call.reject("Invalid archive key", "keychainError")
                        return
                    }
                    call.resolve(["value": data.base64EncodedString()])
                case errSecItemNotFound:
                    call.resolve(["value": NSNull()])
                case errSecUserCanceled:
                    call.reject("Authentication cancelled", "userCancel")
                default:
                    call.reject("Archive unlock failed (\(status))", "keychainError")
                }
            }
        }
    }

    @objc func saveArchiveKey(_ call: CAPPluginCall) {
        guard let query = Self.archiveQuery(call) else { return }
        guard let value = call.getString("value"), let data = Data(base64Encoded: value), data.count == 32 else {
            call.reject("Invalid archive key", "invalidArgument")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let protection = ProcessInfo.processInfo.isiOSAppOnMac
                ? kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                : kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
            guard let access = SecAccessControlCreateWithFlags(nil, protection, .userPresence, nil) else {
                call.reject("Archive protection is unavailable", "keychainError")
                return
            }

            var item = query
            item[kSecAttrAccessControl as String] = access
            item[kSecValueData as String] = data
            let added = SecItemAdd(item as CFDictionary, nil)
            let status = added == errSecDuplicateItem
                ? SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
                : added

            if status == errSecSuccess {
                call.resolve()
            } else {
                call.reject("Archive key save failed (\(status))", "keychainError")
            }
        }
    }

    @objc func removeArchiveKey(_ call: CAPPluginCall) {
        guard let query = Self.archiveQuery(call) else { return }
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Archive key removal failed (\(status))", "keychainError")
        }
    }
}
