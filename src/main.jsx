import ReactDOM from "react-dom/client";
import "./main.css";
import App from "./App";
import { RouterProvider } from './router/RouterProvider';
import { ThemeProvider } from "./utils/ThemeProvider";
import { NotificationProvider } from "./utils/notificationUtils";
import { AuthProvider } from "./context/AuthProvider";
import UnifiedTransactionProvider from "./context/UnifiedTransactionProvider";
import './utils/i18n';
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalErrorReporting } from "./utils/errorReporting";

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <UnifiedTransactionProvider>
            <RouterProvider basename="/soldi-sotto">
              <App />
            </RouterProvider>
          </UnifiedTransactionProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
