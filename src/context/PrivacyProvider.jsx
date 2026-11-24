import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";
import { isMobile } from "../platform/index.js";

const HIDE_AMOUNTS_KEY = "ducat-hide-amounts";
const BIOMETRIC_ENABLED_KEY = "ducat-biometric-lock";
/** Grace period before re-locking after leaving the foreground (e.g. share sheet). */
export const LOCK_GRACE_MS = 5_000;

const readBiometricFlag = () => isMobile() && readLocalValue(BIOMETRIC_ENABLED_KEY) === "true";
const loadBiometrics = () => import("../platform/biometrics.js");

const DEFAULT_PRIVACY = Object.freeze({
  hideAmounts: false,
  toggleHideAmounts: () => {},
  setHideAmounts: () => {},
  biometricAvailable: false,
  biometricType: "none",
  biometricEnabled: false,
  enableBiometricLock: async () => false,
  disableBiometricLock: async () => false,
  locked: false,
  unlocking: false,
  unlock: async () => false,
});

const PrivacyContext = createContext(DEFAULT_PRIVACY);

export const usePrivacy = () => useContext(PrivacyContext);

export const PrivacyProvider = ({ children }) => {
  const [hideAmounts, setHideAmountsState] = useState(() => readLocalValue(HIDE_AMOUNTS_KEY) === "true");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("none");
  const [biometricEnabled, setBiometricEnabled] = useState(readBiometricFlag);
  const [locked, setLocked] = useState(readBiometricFlag);
  const [unlocking, setUnlocking] = useState(false);
  const backgroundAtRef = useRef(null);
  const unlockingRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("privacy-masked", hideAmounts);
    return () => document.documentElement.classList.remove("privacy-masked");
  }, [hideAmounts]);

  const updateHideAmounts = useCallback((nextOrUpdater) => {
    setHideAmountsState((current) => {
      const next = Boolean(typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater);
      if (next) writeLocalValue(HIDE_AMOUNTS_KEY, "true");
      else removeLocalValue(HIDE_AMOUNTS_KEY);
      return next;
    });
  }, []);

  const setHideAmounts = useCallback((next) => updateHideAmounts(next), [updateHideAmounts]);
  const toggleHideAmounts = useCallback(() => updateHideAmounts((current) => !current), [updateHideAmounts]);

  useEffect(() => {
    if (!isMobile()) return undefined;
    let cancelled = false;
    loadBiometrics().then(async ({ checkBiometricAvailability, isBiometricLockEnabled, setBiometricLockEnabled }) => {
      const { available, biometryType } = await checkBiometricAvailability();
      if (cancelled) return;
      setBiometricAvailable(available);
      setBiometricType(biometryType);
      if (!available && isBiometricLockEnabled()) {
        setBiometricLockEnabled(false);
        setBiometricEnabled(false);
        setLocked(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!biometricEnabled) {
      setLocked(false);
      return undefined;
    }

    const onHidden = () => {
      if (backgroundAtRef.current === null) backgroundAtRef.current = Date.now();
    };
    const onVisible = () => {
      const leftAt = backgroundAtRef.current;
      backgroundAtRef.current = null;
      if (leftAt !== null && Date.now() - leftAt >= LOCK_GRACE_MS) {
        setLocked(true);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("ducat:app-inactive", onHidden);
    window.addEventListener("ducat:app-active", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("ducat:app-inactive", onHidden);
      window.removeEventListener("ducat:app-active", onVisible);
    };
  }, [biometricEnabled]);

  const unlock = useCallback(async (reason) => {
    if (unlockingRef.current) return false;
    unlockingRef.current = true;
    setUnlocking(true);
    try {
      const { authenticateBiometric } = await loadBiometrics();
      const { authenticated } = await authenticateBiometric(reason);
      if (authenticated) setLocked(false);
      return authenticated;
    } finally {
      unlockingRef.current = false;
      setUnlocking(false);
    }
  }, []);

  const setBiometricLock = useCallback(async (enabled, reason) => {
    const { authenticateBiometric, setBiometricLockEnabled } = await loadBiometrics();
    const { authenticated } = await authenticateBiometric(reason);
    if (!authenticated) return false;
    setBiometricLockEnabled(enabled);
    setBiometricEnabled(enabled);
    setLocked(false);
    return true;
  }, []);

  const enableBiometricLock = useCallback((reason) => setBiometricLock(true, reason), [setBiometricLock]);
  const disableBiometricLock = useCallback((reason) => setBiometricLock(false, reason), [setBiometricLock]);

  const value = useMemo(() => ({
    hideAmounts,
    toggleHideAmounts,
    setHideAmounts,
    biometricAvailable,
    biometricType,
    biometricEnabled,
    enableBiometricLock,
    disableBiometricLock,
    locked,
    unlocking,
    unlock,
  }), [
    hideAmounts, toggleHideAmounts, setHideAmounts,
    biometricAvailable, biometricType, biometricEnabled,
    enableBiometricLock, disableBiometricLock,
    locked, unlocking, unlock,
  ]);

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};

PrivacyProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default PrivacyProvider;
