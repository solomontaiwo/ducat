import ReactDOM from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque";
import "./main.css";
import App from "./App";
import { RouterProvider } from './router/RouterProvider';
import { ThemeProvider } from "./utils/ThemeProvider";
import { NotificationProvider } from "./utils/notificationUtils";
import { AuthProvider } from "./context/AuthProvider";
import UnifiedTransactionProvider from "./context/UnifiedTransactionProvider";
import PlanningProvider from "./context/PlanningProvider";
import PrivacyProvider from "./context/PrivacyProvider";
import { ensureLanguage } from "./utils/i18n.jsx";
import './utils/installPrompt';
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalErrorReporting } from "./utils/errorReporting";
import { isWeb } from "./platform/index.js";

installGlobalErrorReporting();

// Registering a service worker makes the web app installable. The worker does
// not cache anything (see public/sw.js), so it never serves stale data. The
// packaged shells load their bundle locally and must not register one.
if (import.meta.env.PROD && isWeb() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

ensureLanguage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider>
          {/* The router sits above the data providers: switching between demo and
              account mode remounts them, and must not reset the current route. */}
          <RouterProvider basename={import.meta.env.BASE_URL}>
            <AuthProvider>
              <UnifiedTransactionProvider>
                <PlanningProvider>
                  <PrivacyProvider>
                    <App />
                  </PrivacyProvider>
                </PlanningProvider>
              </UnifiedTransactionProvider>
            </AuthProvider>
          </RouterProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );

  // iOS: theme-aware status bar, splash hand-off, Universal Links and paused auth refresh.
  // Loaded only in the mobile shell so web and desktop bundles stay lean.
  if (import.meta.env.MODE === "mobile") {
    const withClient = (action) => async () => {
      const { supabase } = await import("./utils/supabaseClient.js");
      supabase.auth[action]();
    };
    Promise.all([import("./platform/native"), import("./platform/deepLinks")]).then(
      ([{ startNativeShell }, { installDeepLinkHandler }]) => {
        startNativeShell({
          onActive: () => {
            window.dispatchEvent(new Event("ducat:app-active"));
            return withClient("startAutoRefresh")();
          },
          onInactive: () => {
            window.dispatchEvent(new Event("ducat:app-inactive"));
            return withClient("stopAutoRefresh")();
          },
        });
        installDeepLinkHandler();
      }
    );
  }
});
