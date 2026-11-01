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
import { ensureLanguage } from "./utils/i18n.jsx";
import './utils/installPrompt';
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalErrorReporting } from "./utils/errorReporting";

installGlobalErrorReporting();

// Registering a service worker makes the web app installable. The worker does
// not cache anything (see public/sw.js), so it never serves stale data.
if (import.meta.env.PROD && import.meta.env.MODE !== "desktop" && "serviceWorker" in navigator) {
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
                  <App />
                </PlanningProvider>
              </UnifiedTransactionProvider>
            </AuthProvider>
          </RouterProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
});
