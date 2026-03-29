import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useAuth } from "./AuthProvider.jsx";
import { useUnifiedTransactions } from "./UnifiedTransactionProvider.jsx";
import { useCategories } from "../utils/categories.jsx";
import { BudgetService } from "../services/budgetService.jsx";

const BudgetContext = createContext({
  budgets: [],
  loading: false,
  addBudget: async () => false,
  updateBudget: async () => false,
  deleteBudget: async () => false,
  getBudgetStatus: () => [],
  smartSuggestions: [],
});

export const useBudgets = () => useContext(BudgetContext);

export const BudgetProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { transactions, isDemo } = useUnifiedTransactions();
  const { expenseCategories } = useCategories();

  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadBudgets = useCallback(async () => {
    if (!currentUser) {
      setBudgets([]);
      return;
    }

    setLoading(true);
    try {
      const data = await BudgetService.fetchAll(currentUser.uid);
      setBudgets(data);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isDemo) {
      loadBudgets();
    }
  }, [isDemo, loadBudgets]);

  const addBudget = useCallback(
    async (payload) => {
      if (!currentUser || isDemo) return false;
      await BudgetService.add(currentUser.uid, payload);
      await loadBudgets();
      return true;
    },
    [currentUser, isDemo, loadBudgets]
  );

  const updateBudget = useCallback(
    async (id, payload) => {
      if (!currentUser || isDemo) return false;
      await BudgetService.update(id, payload);
      await loadBudgets();
      return true;
    },
    [currentUser, isDemo, loadBudgets]
  );

  const deleteBudget = useCallback(
    async (id) => {
      if (!currentUser || isDemo) return false;
      await BudgetService.delete(id);
      await loadBudgets();
      return true;
    },
    [currentUser, isDemo, loadBudgets]
  );

  const getBudgetStatus = useCallback(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthExpenses = transactions.filter(
      (t) => t.type === "expense" && (t.date instanceof Date ? t.date : new Date(t.date)) >= monthStart
    );

    return budgets.map((budget) => {
      const spent = currentMonthExpenses
        .filter((t) => t.category === budget.category)
        .reduce((sum, t) => sum + t.amount, 0);

      const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
      return {
        ...budget,
        spent,
        percentage,
        remaining: Math.max(0, budget.limit - spent),
      };
    });
  }, [budgets, transactions]);

  const smartSuggestions = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthExpenses = transactions.filter(
      (t) => t.type === "expense" && (t.date instanceof Date ? t.date : new Date(t.date)) >= monthStart
    );

    const existing = new Set(budgets.map((b) => b.category));

    return expenseCategories
      .filter((category) => !existing.has(category.value))
      .map((category) => {
        const spent = currentMonthExpenses
          .filter((t) => t.category === category.value)
          .reduce((sum, t) => sum + t.amount, 0);

        return {
          category: category.value,
          label: category.label,
          suggestedLimit: Math.max(20, Math.round(spent * 1.1)),
        };
      })
      .filter((entry) => entry.suggestedLimit > 20)
      .slice(0, 5);
  }, [transactions, budgets, expenseCategories]);

  return (
    <BudgetContext.Provider
      value={{
        budgets,
        loading,
        addBudget,
        updateBudget,
        deleteBudget,
        getBudgetStatus,
        smartSuggestions,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

BudgetProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
