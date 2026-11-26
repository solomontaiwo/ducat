import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { subscribeNativeNavigation, updateNativeNavigation } from "../../platform/nativeNavigation.js";

// Destinations of the native tab bar (iPhone Duo vertical bar).
const NATIVE_TAB_PATHS = ["/dashboard", "/transactions", "/analytics"];

/**
 * Keeps the native tab bar in the iPhone Duo vertical bar in sync with the web
 * app. Loaded only in the iOS build; renders nothing.
 */
const NativeNavigationBridge = ({ available, onAvailabilityChange, visible, path, badge, addEnabled, onNavigate, onAdd }) => {
  const { t } = useTranslation();
  // Listeners are registered once and read the latest callbacks through refs.
  const callbacks = useRef({ onAvailabilityChange, onNavigate, onAdd });
  callbacks.current = { onAvailabilityChange, onNavigate, onAdd };

  useEffect(() => subscribeNativeNavigation({
    onAvailability: (value) => callbacks.current.onAvailabilityChange(value),
    onSelect: (target) => { if (NATIVE_TAB_PATHS.includes(target)) callbacks.current.onNavigate(target); },
    onAdd: () => callbacks.current.onAdd(),
  }), []);

  useEffect(() => {
    if (!available) return;
    updateNativeNavigation({
      visible,
      path,
      badge,
      addEnabled,
      labels: {
        dashboard: t("navbar.dashboard"),
        transactions: t("navbar.transactions"),
        analytics: t("navbar.analytics"),
        add: t("navbar.add"),
      },
    });
  }, [available, visible, path, badge, addEnabled, t]);

  return null;
};

NativeNavigationBridge.propTypes = {
  available: PropTypes.bool.isRequired,
  onAvailabilityChange: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
  path: PropTypes.string.isRequired,
  badge: PropTypes.string,
  addEnabled: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

export default NativeNavigationBridge;
