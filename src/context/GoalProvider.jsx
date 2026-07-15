import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useAuth } from "./AuthProvider.jsx";
import { useUnifiedTransactions } from "./UnifiedTransactionProvider.jsx";

const GoalContext = createContext({
  goals: [],
  loading: false,
  addGoal: async () => false,
  updateGoal: async () => false,
  deleteGoal: async () => false,
  addContribution: async () => false,
  applyAutoContributions: async () => 0,
});

export const useGoals = () => useContext(GoalContext);

export const GoalProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { isDemo, transactions } = useUnifiedTransactions();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadGoals = useCallback(async () => {
    if (!currentUser) {
      setGoals([]);
      return;
    }

    setLoading(true);
    try {
      const { GoalService } = await import("../services/goalService.jsx");
      const data = await GoalService.fetchAll(currentUser.uid);
      setGoals(data);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isDemo) {
      loadGoals();
    }
  }, [isDemo, loadGoals]);

  const addGoal = useCallback(
    async (payload) => {
      if (!currentUser || isDemo) return false;
      const { GoalService } = await import("../services/goalService.jsx");
      await GoalService.add(currentUser.uid, payload);
      await loadGoals();
      return true;
    },
    [currentUser, isDemo, loadGoals]
  );

  const updateGoal = useCallback(
    async (id, payload) => {
      if (!currentUser || isDemo) return false;
      const { GoalService } = await import("../services/goalService.jsx");
      await GoalService.update(id, payload);
      await loadGoals();
      return true;
    },
    [currentUser, isDemo, loadGoals]
  );

  const deleteGoal = useCallback(
    async (id) => {
      if (!currentUser || isDemo) return false;
      const { GoalService } = await import("../services/goalService.jsx");
      await GoalService.delete(id);
      await loadGoals();
      return true;
    },
    [currentUser, isDemo, loadGoals]
  );

  const addContribution = useCallback(
    async (id, amount) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal || !amount || amount <= 0) return false;
      const nextValue = Math.min(goal.targetAmount, goal.currentAmount + amount);
      return updateGoal(id, { currentAmount: nextValue });
    },
    [goals, updateGoal]
  );

  const availableSavings = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return Math.max(0, income - expense);
  }, [transactions]);

  const applyAutoContributions = useCallback(async () => {
    const autoGoals = goals.filter(
      (goal) => goal.autoContribute && goal.autoContributeAmount > 0 && goal.currentAmount < goal.targetAmount
    );

    if (!autoGoals.length) return 0;

    let allocated = 0;
    for (const goal of autoGoals) {
      const remainingPool = Math.max(0, availableSavings - allocated);
      if (remainingPool <= 0) break;

      const nextAmount = Math.min(goal.autoContributeAmount, remainingPool);
      const currentAmount = Math.min(goal.targetAmount, goal.currentAmount + nextAmount);
      const { GoalService } = await import("../services/goalService.jsx");
      await GoalService.update(goal.id, { currentAmount });
      allocated += nextAmount;
    }

    if (allocated > 0) {
      await loadGoals();
    }

    return allocated;
  }, [goals, availableSavings, loadGoals]);

  return (
    <GoalContext.Provider
      value={{
        goals,
        loading,
        addGoal,
        updateGoal,
        deleteGoal,
        addContribution,
        applyAutoContributions,
      }}
    >
      {children}
    </GoalContext.Provider>
  );
};

GoalProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
