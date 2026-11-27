import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FiLock } from "react-icons/fi";
import { usePrivacy } from "../../context/PrivacyProvider.jsx";
import { Button } from "../ui/button";
import { trackOpenDialog } from "../ui/dialogStack.js";
import { APP_NAME } from "../../utils/brand.js";

const logo = `${import.meta.env.BASE_URL}icon-192.png`;

/**
 * Full-screen biometric lock gate shown on iOS when biometric lock is active
 * and the app has just launched or returned from the background.
 */
const AppLockOverlay = () => {
  const { locked, unlocking, unlock, biometricType } = usePrivacy();
  const { t } = useTranslation();
  const autoPromptedRef = useRef(false);

  const labelKey = biometricType === "touchID"
    ? "privacy.biometric.touchId"
    : biometricType === "faceID"
      ? "privacy.biometric.faceId"
      : "privacy.biometric.device";
  const biometricLabel = t(labelKey);
  const reason = t("privacy.biometric.promptReason", { app: APP_NAME });

  useEffect(() => {
    if (!locked) {
      autoPromptedRef.current = false;
      return;
    }
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    unlock(reason);
  }, [locked, unlock, reason]);

  // Counts as an open dialog: native bars and pull to refresh step aside.
  useEffect(() => (locked ? trackOpenDialog() : undefined), [locked]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center"
    >
      <div className="w-full max-w-xs space-y-6">
        <div className="mx-auto flex flex-col items-center gap-3">
          <img src={logo} alt="" width="56" height="56" className="h-14 w-14 rounded-2xl shadow-md" />
          <h1 id="app-lock-title" className="font-display text-2xl font-extrabold">
            {t("privacy.biometric.lockedTitle", { app: APP_NAME })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("privacy.biometric.lockedSubtitle")}
          </p>
        </div>
        <Button
          size="lg"
          className="w-full gap-2 rounded-2xl"
          disabled={unlocking}
          onClick={() => unlock(reason)}
        >
          <FiLock className="h-4 w-4" aria-hidden="true" />
          {unlocking
            ? t("privacy.biometric.unlocking")
            : t("privacy.biometric.unlockWith", { method: biometricLabel })}
        </Button>
      </div>
    </div>
  );
};

export default AppLockOverlay;
