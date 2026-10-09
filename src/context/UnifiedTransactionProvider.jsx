import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useAuth } from "./AuthProvider.jsx";
import { TransactionProvider, useTransactions } from "./TransactionProvider.jsx";
import { DemoProvider, useDemo, MAX_DEMO_TRANSACTIONS } from "./DemoProvider.jsx";
import { useNotification } from "../utils/notificationUtils.jsx";
import PropTypes from "prop-types";
import { useTranslation } from 'react-i18next';
import { getTransactionAmountMinor, minorToMajor } from "../utils/money.js";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";

const EMPTY_PAGE = Object.freeze({ items: [], nextCursor: null, hasMore: false });
const EMPTY_STATS = Object.freeze({
  totalIncome: 0,
  totalExpense: 0,
  balance: 0,
  transactionCount: 0,
  categoryBreakdown: {},
});

// Shared base for every state in which no transaction source is available
// (booting, unverified account, signed out). Each state overrides only what
// differs, so the contract of the context lives in exactly one place.
const INERT_VALUE = Object.freeze({
  transactions: [],
  loading: false,
  addTransaction: async () => false,
  updateTransaction: async () => false,
  deleteTransaction: async () => false,
  generateSampleTransactions: async () => false,
  clearTransactions: () => {},
  fetchAllTransactions: async () => [],
  getTotalTransactionCount: async () => 0,
  fetchTransactionPage: async () => EMPTY_PAGE,
  recentRevision: 0,
  canAddMoreTransactions: false,
  maxTransactions: 0,
  getStats: () => EMPTY_STATS,
  isDemo: false,
  isAuthenticated: false,
  seedOnMount: false,
  startDemo: () => false,
  stopDemo: () => {},
});

const UnifiedTransactionContext = createContext({ ...INERT_VALUE, loading: true });

export const useUnifiedTransactions = () => useContext(UnifiedTransactionContext);
const DEMO_FLAG_KEY = "soldi-sotto-demo-enabled";

// Wrapper for Firebase provider
const FirebaseTransactionWrapper = ({ children }) => {
  const { currentUser } = useAuth();
  const { transactions, loading, recentRevision, fetchAllTransactions, fetchTransactionPage, getTotalTransactionCount } = useTransactions();
  const [isProcessing, setIsProcessing] = useState(false);
  const notification = useNotification();
  const { t } = useTranslation();

  // Adds Firebase transaction
  const addTransaction = useCallback(async (transactionData) => {
    if (!currentUser) return false;
    
    setIsProcessing(true);
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      const { clientRequestId, ...payload } = transactionData;
      await TransactionService.add(currentUser.uid, payload, { requestId: clientRequestId });
      notification.success(t('notifications.addSuccess'));
      return true;
    } catch (error) {
      console.error("Error adding transaction:", error);
      // Zod validation errors carry English technical messages; show a localized one.
      if (error.issues) {
         notification.error(t('validation.invalidTransaction'));
      } else {
         notification.error(t('notifications.addError'));
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser, notification, t]);

  // Updates Firebase transaction
  const updateTransaction = useCallback(async (transactionId, updatedData) => {
    if (!currentUser) return false;
    
    setIsProcessing(true);
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      await TransactionService.update(transactionId, updatedData);
      notification.success(t('notifications.updateSuccess'));
      return true;
    } catch (error) {
      console.error("Error updating transaction:", error);
      notification.error(t('notifications.updateError'));
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser, notification, t]);

  // Deletes Firebase transaction
  const deleteTransaction = useCallback(async (transactionId) => {
    if (!currentUser) return false;
    
    setIsProcessing(true);
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      await TransactionService.delete(transactionId);
      notification.success(t('notifications.deleteSuccess'));
      return true;
    } catch (error) {
      console.error("Error deleting transaction:", error);
      notification.error(t('notifications.deleteError'));
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser, notification, t]);

  // Totals over the realtime stream only (the most recent transactions);
  // range-accurate figures come from fetchAllTransactions.
  const getStats = useCallback(() => {
    const totalIncome = transactions
      .filter(t => t.type === "income")
      .reduce((sum, transaction) => sum + getTransactionAmountMinor(transaction), 0);
    
    const totalExpense = transactions
      .filter(t => t.type === "expense")
      .reduce((sum, transaction) => sum + getTransactionAmountMinor(transaction), 0);

    return {
      totalIncome: minorToMajor(totalIncome),
      totalExpense: minorToMajor(totalExpense),
      balance: minorToMajor(totalIncome - totalExpense),
      transactionCount: transactions.length,
      canAddMore: true, // No limit for registered users
    };
  }, [transactions]);

  const value = useMemo(() => ({
    ...INERT_VALUE,
    transactions,
    loading,
    isProcessing,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fetchAllTransactions, // Expose specifically for analytics
    fetchTransactionPage,
    getTotalTransactionCount,
    recentRevision,
    canAddMoreTransactions: true,
    maxTransactions: Infinity,
    getStats,
    isAuthenticated: true,
  }), [
    transactions, loading, isProcessing, addTransaction, updateTransaction, deleteTransaction,
    fetchAllTransactions, fetchTransactionPage, getTotalTransactionCount, recentRevision, getStats,
  ]);

  return (
    <UnifiedTransactionContext.Provider value={value}>
      {children}
    </UnifiedTransactionContext.Provider>
  );
};

// Wrapper for Demo provider
const DemoTransactionWrapper = ({ children, startDemo, seedDemo, stopDemo }) => {
  const {
    transactions,
    loading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    canAddMoreTransactions,
    getDemoStats,
    generateSampleTransactions,
    clearTransactions,
  } = useDemo();

  // Mock fetchAllTransactions for demo (just returns what we have)
  const fetchAllTransactions = useCallback(async () => {
    return transactions;
  }, [transactions]);

  // Mock getTotalTransactionCount for demo
  const getTotalTransactionCount = useCallback(async () => {
    return transactions.length;
  }, [transactions]);

  const fetchTransactionPage = useCallback(async ({ pageSize = 40, cursor = 0 } = {}) => {
    const start = typeof cursor === "number" ? cursor : 0;
    const items = transactions.slice(start, start + pageSize);
    return {
      items,
      nextCursor: start + items.length,
      hasMore: start + items.length < transactions.length,
    };
  }, [transactions]);

  const value = useMemo(() => ({
    ...INERT_VALUE,
    transactions,
    loading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    generateSampleTransactions,
    clearTransactions,
    fetchAllTransactions,
    fetchTransactionPage,
    getTotalTransactionCount,
    recentRevision: transactions.length,
    canAddMoreTransactions,
    maxTransactions: MAX_DEMO_TRANSACTIONS,
    getStats: getDemoStats,
    isDemo: true,
    seedOnMount: seedDemo,
    startDemo,
    stopDemo,
  }), [
    transactions, loading, addTransaction, updateTransaction, deleteTransaction,
    generateSampleTransactions, clearTransactions, fetchAllTransactions, fetchTransactionPage,
    getTotalTransactionCount, canAddMoreTransactions, getDemoStats, seedDemo, startDemo, stopDemo,
  ]);

  return (
    <UnifiedTransactionContext.Provider value={value}>
      {children}
    </UnifiedTransactionContext.Provider>
  );
};

// Main unified provider
export const UnifiedTransactionProvider = ({ children }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(() => {
    return readLocalValue(DEMO_FLAG_KEY) === "true";
  });
  const [seedDemo, setSeedDemo] = useState(false);

  const startDemo = useCallback(() => {
    writeLocalValue(DEMO_FLAG_KEY, "true");
    setDemoEnabled(true);
    setSeedDemo(true);
    return true;
  }, []);

  const stopDemo = useCallback(() => {
    removeLocalValue(DEMO_FLAG_KEY);
    setDemoEnabled(false);
    setSeedDemo(false);
  }, []);

  useEffect(() => {
    // Wait for authentication to complete
    if (!authLoading) {
      setIsReady(true);
    }
  }, [authLoading]);

  const hasUser = Boolean(currentUser);
  const inertValue = useMemo(() => {
    if (!isReady) return { ...INERT_VALUE, loading: true, startDemo, stopDemo };
    // Signed in but unverified: Firestore rules would deny every read, so no
    // listener is opened and the UI sees an empty, authenticated state.
    if (hasUser) return { ...INERT_VALUE, isAuthenticated: true, startDemo, stopDemo };
    return { ...INERT_VALUE, startDemo, stopDemo };
  }, [isReady, hasUser, startDemo, stopDemo]);

  if (isReady && currentUser?.emailVerified) {
    return (
      <TransactionProvider>
        <FirebaseTransactionWrapper>
          {children}
        </FirebaseTransactionWrapper>
      </TransactionProvider>
    );
  }

  // If the user is not authenticated but demo is enabled, use Demo
  if (isReady && !currentUser && demoEnabled) {
    return (
      <DemoProvider seedOnMount={seedDemo}>
        <DemoTransactionWrapper startDemo={startDemo} seedDemo={seedDemo} stopDemo={stopDemo}>
          {children}
        </DemoTransactionWrapper>
      </DemoProvider>
    );
  }

  return (
    <UnifiedTransactionContext.Provider value={inertValue}>
      {children}
    </UnifiedTransactionContext.Provider>
  );
};

FirebaseTransactionWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};

DemoTransactionWrapper.propTypes = {
  children: PropTypes.node.isRequired,
  startDemo: PropTypes.func.isRequired,
  seedDemo: PropTypes.bool,
  stopDemo: PropTypes.func.isRequired,
};

UnifiedTransactionProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default UnifiedTransactionProvider;
