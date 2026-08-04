import { firebaseApp } from "./firebaseApp";

let appCheckPromise;

export const ensureFirebaseAppCheck = async () => {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey) return null;
  if (!appCheckPromise) {
    appCheckPromise = import("firebase/app-check").then(({
      initializeAppCheck,
      ReCaptchaEnterpriseProvider,
      ReCaptchaV3Provider,
    }) => {
      if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG === "true") {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      const provider = import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER === "recaptcha-v3"
        ? new ReCaptchaV3Provider(siteKey)
        : new ReCaptchaEnterpriseProvider(siteKey);
      return initializeAppCheck(firebaseApp, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    });
  }
  return appCheckPromise;
};
