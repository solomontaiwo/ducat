import Foundation
import StoreKit
import UIKit
import UserNotifications
import Capacitor

/// Local Capacitor plugin for lightweight iOS-native capabilities that need no
/// external dependencies:
/// - `UNUserNotificationCenter` local reminders for upcoming recurring rules
///   (with foreground presentation and tap-to-route handling);
/// - `SKStoreReviewController` in-app App Store review prompt.
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
    ]

    private static let reminderPrefix = "ducat-rec-"
    private static let maxReminders = 40
    private var pendingRoute: String?

    override public func load() {
        UNUserNotificationCenter.current().delegate = self
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
            DispatchQueue.main.async {
                self.pendingRoute = route
                self.notifyListeners("reminderTapped", data: ["route": route])
            }
        }
        completionHandler()
    }

    @objc func consumePendingRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let route = self.pendingRoute
            self.pendingRoute = nil
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
}
