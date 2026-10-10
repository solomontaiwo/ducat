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
import './utils/i18n';
import './utils/installPrompt';
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalErrorReporting } from "./utils/errorReporting";

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <ThemeProvider>
      <NotificationProvider>
        {/* The router sits above the data providers: switching between demo and
            Firestore mode remounts them, and must not reset the current route. */}
        <RouterProvider basename="/soldi-sotto">
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
