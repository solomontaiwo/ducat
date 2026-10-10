import { useEffect, useState } from "react";

/**
 * Captures the browser's "install app" prompt as early as possible (it fires
 * once, often before the profile page exists) so the profile can offer it.
 */
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

const isStandalone = () => typeof window !== "undefined" && (
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
);

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const useInstallPrompt = () => {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const standalone = isStandalone();
  return {
    canPrompt: !standalone && Boolean(deferredPrompt),
    needsManualSteps: !standalone && !deferredPrompt && isIos(),
    install: async () => {
      if (!deferredPrompt) return false;
      const prompt = deferredPrompt;
      deferredPrompt = null;
      notify();
      await prompt.prompt();
      const choice = await prompt.userChoice;
      return choice?.outcome === "accepted";
    },
  };
};
