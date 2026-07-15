import ReactDOM from "react-dom/client";
import "./main.css";
import App from "./App";
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from "./utils/ThemeProvider";
import { NotificationProvider } from "./utils/notificationUtils";
import { AuthProvider } from "./context/AuthProvider";
import UnifiedTransactionProvider from "./context/UnifiedTransactionProvider";
import { BudgetProvider } from "./context/BudgetProvider";
import { GoalProvider } from "./context/GoalProvider";
import { RecurringRuleProvider } from "./context/RecurringRuleProvider";
import './utils/i18n';

ReactDOM.createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <NotificationProvider>
      <AuthProvider>
        <UnifiedTransactionProvider>
          <BudgetProvider>
            <RecurringRuleProvider>
          <GoalProvider>
            <BrowserRouter basename="/soldi-sotto">
              <App />
            </BrowserRouter>
          </GoalProvider>
            </RecurringRuleProvider>
          </BudgetProvider>
        </UnifiedTransactionProvider>
      </AuthProvider>
    </NotificationProvider>
  </ThemeProvider>
);
