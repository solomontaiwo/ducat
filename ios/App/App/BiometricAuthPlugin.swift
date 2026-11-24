import Foundation
import LocalAuthentication
import Capacitor

/// Local Capacitor plugin exposing iOS Face ID / Touch ID (with device passcode
/// fallback) without requiring external third-party packages.
@objc(BiometricAuthPlugin)
public class BiometricAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricAuthPlugin"
    public let jsName = "BiometricAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var biometricsError: NSError?
        let canBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricsError)

        if canBiometrics {
            call.resolve([
                "available": true,
                "biometryType": Self.biometryLabel(context.biometryType),
            ])
            return
        }

        var passcodeError: NSError?
        let canDeviceAuth = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &passcodeError)
        call.resolve([
            "available": canDeviceAuth,
            "biometryType": canDeviceAuth ? "passcode" : "none",
        ])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock Ducat"
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.reject("Biometric authentication is not available", "notAvailable", error)
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["authenticated": true])
                } else {
                    let laError = evalError as? LAError
                    let code: String
                    switch laError?.code {
                    case .userCancel, .systemCancel, .appCancel:
                        code = "userCancel"
                    default:
                        code = "failed"
                    }
                    call.reject(evalError?.localizedDescription ?? "Authentication failed", code, evalError)
                }
            }
        }
    }

    private static func biometryLabel(_ type: LABiometryType) -> String {
        switch type {
        case .faceID:
            return "faceID"
        case .touchID:
            return "touchID"
        default:
            if #available(iOS 17.0, *), type == .opticID {
                return "opticID"
            }
            return "none"
        }
    }
}
