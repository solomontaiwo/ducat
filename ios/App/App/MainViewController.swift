import Capacitor

/// Registers local native plugins bundled with the iOS app.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BiometricAuthPlugin())
    }
}
