import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { subscribeNativeNavigation, updateNativeNavigation } from "../../platform/nativeNavigation.js";
import { isTabPath } from "../../router/tabs.js";

/**
 * Keeps the native tab bar in the iPhone Duo vertical bar in sync with the web
 * app. Loaded only in the iOS build; renders nothing.
 */
const NativeNavigationBridge = ({ onAvailabilityChange, visible, layout, path, badge, addEnabled, onNavigate, onAdd }) => {
  const { t } = useTranslation();
  // Listeners are registered once and read the latest callbacks through refs.
  const callbacks = useRef({ onAvailabilityChange, onNavigate, onAdd });
  callbacks.current = { onAvailabilityChange, onNavigate, onAdd };

  useEffect(() => subscribeNativeNavigation({
    onAvailability: (value) => callbacks.current.onAvailabilityChange(value),
    onSelect: (target) => { if (isTabPath(target)) callbacks.current.onNavigate(target); },
    onAdd: () => callbacks.current.onAdd(),
  }), []);

  // Always sent, also before the native bar exists: on the iPhone Duo the
  // layout decides whether iOS shows the vertical bar at all.
  useEffect(() => {
    updateNativeNavigation({
      visible,
      layout,
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
  }, [visible, layout, path, badge, addEnabled, t]);

  return null;
};

NativeNavigationBridge.propTypes = {
  onAvailabilityChange: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
  layout: PropTypes.oneOf(["phone", "sidebar"]).isRequired,
  path: PropTypes.string.isRequired,
  badge: PropTypes.string,
  addEnabled: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

export default NativeNavigationBridge;
