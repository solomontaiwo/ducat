import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { subscribeNativeNavigation, updateNativeNavigation } from "../../platform/nativeNavigation.js";
import { isTabPath } from "../../router/tabs.js";

/**
 * Keeps the native tab bar in the iPhone Duo vertical bar in sync with the web
 * app. Loaded only in the iOS build; renders nothing.
 */
const NativeNavigationBridge = ({ onAvailabilityChange, visible, layout, path, badge, addEnabled, profilePath, onNavigate, onAdd }) => {
  const { t } = useTranslation();
  // Listeners are registered once and read the latest callbacks through refs.
  const callbacks = useRef({ onAvailabilityChange, onNavigate, onAdd, path, profilePath });
  callbacks.current = { onAvailabilityChange, onNavigate, onAdd, path, profilePath };

  useEffect(() => subscribeNativeNavigation({
    onAvailability: (value, profileNavigation) => callbacks.current.onAvailabilityChange(value, profileNavigation),
    onSelect: (target) => {
      if (!isTabPath(target)) return;
      if (target === callbacks.current.path) {
        window.scrollTo?.({ top: 0, behavior: "smooth" });
      } else {
        callbacks.current.onNavigate(target);
      }
    },
    onAdd: () => callbacks.current.onAdd(),
    onProfile: () => {
      if (callbacks.current.path === callbacks.current.profilePath) {
        window.scrollTo?.({ top: 0, behavior: "smooth" });
      } else {
        callbacks.current.onNavigate(callbacks.current.profilePath);
      }
    },
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
      profileMode: profilePath === "/profile" ? "account" : profilePath === "/verify-email" ? "verifyEmail" : "register",
      labels: {
        dashboard: t("navbar.dashboard"),
        transactions: t("navbar.transactions"),
        analytics: t("navbar.analytics"),
        profile: t(profilePath === "/profile" ? "navbar.profileAndSettings" : profilePath === "/verify-email" ? "demo.confirmEmail" : "navbar.register"),
        add: t("navbar.add"),
      },
    });
  }, [visible, layout, path, badge, addEnabled, profilePath, t]);

  return null;
};

NativeNavigationBridge.propTypes = {
  onAvailabilityChange: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
  layout: PropTypes.oneOf(["phone", "sidebar"]).isRequired,
  path: PropTypes.string.isRequired,
  badge: PropTypes.string,
  addEnabled: PropTypes.bool.isRequired,
  profilePath: PropTypes.oneOf(["/profile", "/verify-email", "/register"]).isRequired,
  onNavigate: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

export default NativeNavigationBridge;
