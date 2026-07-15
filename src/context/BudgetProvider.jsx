import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useAuth } from "./AuthProvider.jsx";
import { useUnifiedTransactions } from "./UnifiedTransactionProvider.jsx";
import { useCategories } from "../utils/categories.jsx";
import { isInBudgetPeriod } from "../utils/budgetPeriod.js";

const BudgetContext = createContext({ budgets: [], loading: false, addBudget: async () => false, deleteBudget: async () => false, getBudgetStatus: () => [], smartSuggestions: [] });
export const useBudgets = () => useContext(BudgetContext);

export const BudgetProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { transactions, isDemo } = useUnifiedTransactions();
  const { expenseCategories } = useCategories();
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const loadBudgets = useCallback(async () => {
    if (!currentUser || isDemo) { setBudgets([]); return; }
    setLoading(true);
    try {
      const { BudgetService } = await import("../services/budgetService.jsx");
      setBudgets(await BudgetService.fetchAll(currentUser.uid));
    } finally { setLoading(false); }
  }, [currentUser, isDemo]);
  useEffect(() => { loadBudgets(); }, [loadBudgets]);
  const addBudget = useCallback(async (payload) => {
    if (!currentUser || isDemo) return false;
    const { BudgetService } = await import("../services/budgetService.jsx");
    await BudgetService.add(currentUser.uid, payload); await loadBudgets(); return true;
  }, [currentUser, isDemo, loadBudgets]);
  const deleteBudget = useCallback(async (id) => {
    if (!currentUser || isDemo) return false;
    const { BudgetService } = await import("../services/budgetService.jsx");
    await BudgetService.delete(id); await loadBudgets(); return true;
  }, [currentUser, isDemo, loadBudgets]);
  const getBudgetStatus = useCallback(() => budgets.map((budget) => {
    const spent = transactions.filter((transaction) => transaction.type === "expense" && transaction.category === budget.category && isInBudgetPeriod(transaction.date, budget.period || "monthly"))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { ...budget, spent, percentage: budget.limit > 0 ? (spent / budget.limit) * 100 : 0, remaining: Math.max(0, budget.limit - spent) };
  }), [budgets, transactions]);
  const smartSuggestions = useMemo(() => {
    const existing = new Set(budgets.map((budget) => budget.category));
    return expenseCategories.filter((category) => !existing.has(category.value)).map((category) => {
      const spent = transactions.filter((transaction) => transaction.type === "expense" && transaction.category === category.value && isInBudgetPeriod(transaction.date, "monthly"))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      return { category: category.value, label: category.label, suggestedLimit: Math.max(20, Math.round(spent * 1.1)) };
    }).filter((entry) => entry.suggestedLimit > 20).slice(0, 5);
  }, [budgets, expenseCategories, transactions]);
  return <BudgetContext.Provider value={{ budgets, loading, addBudget, deleteBudget, getBudgetStatus, smartSuggestions }}>{children}</BudgetContext.Provider>;
};
BudgetProvider.propTypes = { children: PropTypes.node.isRequired };
