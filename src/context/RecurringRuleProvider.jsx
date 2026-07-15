import { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useAuth } from "./AuthProvider.jsx";
import { useUnifiedTransactions } from "./UnifiedTransactionProvider.jsx";

const RecurringRuleContext = createContext({
  rules: [],
  loading: false,
  addRule: async () => false,
  updateRule: async () => false,
  deleteRule: async () => false,
});

export const useRecurringRules = () => useContext(RecurringRuleContext);

export const RecurringRuleProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { isDemo } = useUnifiedTransactions();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRules = useCallback(async () => {
    if (!currentUser || isDemo) {
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const { RecurringRuleService } = await import("../services/recurringRuleService.jsx");
      setRules(await RecurringRuleService.fetchAll(currentUser.uid));
    } finally {
      setLoading(false);
    }
  }, [currentUser, isDemo]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = useCallback(async (payload) => {
    if (!currentUser || isDemo) return false;
    const { RecurringRuleService } = await import("../services/recurringRuleService.jsx");
    await RecurringRuleService.add(currentUser.uid, payload);
    await loadRules();
    return true;
  }, [currentUser, isDemo, loadRules]);

  const updateRule = useCallback(async (id, payload) => {
    if (!currentUser || isDemo) return false;
    const { RecurringRuleService } = await import("../services/recurringRuleService.jsx");
    await RecurringRuleService.update(id, payload);
    await loadRules();
    return true;
  }, [currentUser, isDemo, loadRules]);

  const deleteRule = useCallback(async (id) => {
    if (!currentUser || isDemo) return false;
    const { RecurringRuleService } = await import("../services/recurringRuleService.jsx");
    await RecurringRuleService.delete(id);
    await loadRules();
    return true;
  }, [currentUser, isDemo, loadRules]);

  return <RecurringRuleContext.Provider value={{ rules, loading, addRule, updateRule, deleteRule }}>{children}</RecurringRuleContext.Provider>;
};

RecurringRuleProvider.propTypes = { children: PropTypes.node.isRequired };
