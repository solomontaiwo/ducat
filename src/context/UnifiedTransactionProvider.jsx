import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const OFFLINE_QUEUE_PREFIX = "ducat-offline-queue:";
const hasStoredOfflineQueue = (userId) => Boolean(userId && readLocalValue(`${OFFLINE_QUEUE_PREFIX}${userId}`));
const isDeviceOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const loadOfflineQueue = () => import("../utils/offlineQueue.js");

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
  getTransactionTotals: async () => ({ count: 0, incomeMinor: 0, expenseMinor: 0 }),
  getFirstTransactionDate: async () => null,
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
  pendingOfflineCount: 0,
  syncingOfflineQueue: false,
  syncOfflineQueue: async () => ({ synced: 0, failed: 0 }),
});

const UnifiedTransactionContext = createContext({ ...INERT_VALUE, loading: true });

export const useUnifiedTransactions = () => useContext(UnifiedTransactionContext);
const DEMO_FLAG_KEY = "ducat-demo-enabled";

// Wrapper for the signed-in (Supabase) provider
const AccountTransactionWrapper = ({ children }) => {
  const { currentUser } = useAuth();
  const {
    transactions: serverTransactions,
    loading,
    recentRevision: serverRevision,
    fetchAllTransactions: fetchAllServer,
    fetchTransactionPage: fetchPageServer,
    getTotalTransactionCount: getTotalCountServer,
    getTransactionTotals: getTotalsServer,
    getFirstTransactionDate,
  } = useTransactions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  // Several writes can overlap: only the last one finishing turns the flag off.
  const processingRef = useRef(0);
  const syncingRef = useRef(false);
  const beginProcessing = useCallback(() => {
    processingRef.current += 1;
    setIsProcessing(true);
  }, []);
  const endProcessing = useCallback(() => {
    processingRef.current = Math.max(0, processingRef.current - 1);
    if (processingRef.current === 0) setIsProcessing(false);
  }, []);
  const notification = useNotification();
  const { t } = useTranslation();

  const refreshPending = useCallback(async (uid) => {
    if (!hasStoredOfflineQueue(uid)) {
      setPendingTransactions([]);
      return [];
    }
    const { readOfflineQueue, queuedItemToTransaction } = await loadOfflineQueue();
    const items = readOfflineQueue(uid);
    const mapped = items.map((item) => queuedItemToTransaction(uid, item));
    setPendingTransactions(mapped);
    return items;
  }, []);

  useEffect(() => {
    refreshPending(currentUser?.uid);
  }, [currentUser?.uid, refreshPending]);

  // Merge optimistic pending offline items ahead of server rows, deduplicating by id.
  const transactions = useMemo(() => {
    if (!pendingTransactions.length) return serverTransactions;
    const seen = new Set(serverTransactions.map((item) => item.id));
    const extras = pendingTransactions.filter((item) => !seen.has(item.id));
    return extras.length ? [...extras, ...serverTransactions] : serverTransactions;
  }, [pendingTransactions, serverTransactions]);

  const recentRevision = serverRevision + queueRevision;

  const fetchAllTransactions = useCallback(async (options = {}) => {
    let remote = [];
    try {
      remote = await fetchAllServer(options);
    } catch (error) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        remote = serverTransactions;
      } else {
        throw error;
      }
    }
    if (!pendingTransactions.length) return remote;
    const { mergePendingTransactions } = await loadOfflineQueue();
    return mergePendingTransactions(remote, pendingTransactions, options);
  }, [fetchAllServer, pendingTransactions, serverTransactions]);

  const fetchTransactionPage = useCallback(async (options = {}) => {
    try {
      const page = await fetchPageServer(options);
      if (options.cursor || !pendingTransactions.length) return page;
      const { mergePendingTransactions } = await loadOfflineQueue();
      return {
        ...page,
        items: mergePendingTransactions(page.items, pendingTransactions, options),
      };
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { buildOfflinePage } = await loadOfflineQueue();
      return buildOfflinePage(serverTransactions, pendingTransactions, options);
    }
  }, [fetchPageServer, pendingTransactions, serverTransactions]);

  const getTotalTransactionCount = useCallback(async (options = {}) => {
    try {
      const count = await getTotalCountServer(options);
      if (!pendingTransactions.length) return count;
      const { mergePendingTotals } = await loadOfflineQueue();
      return mergePendingTotals({ count, incomeMinor: 0, expenseMinor: 0 }, serverTransactions, pendingTransactions, options).count;
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { computeOfflineTotals } = await loadOfflineQueue();
      return computeOfflineTotals(serverTransactions, pendingTransactions, options).count;
    }
  }, [getTotalCountServer, pendingTransactions, serverTransactions]);

  const getTransactionTotals = useCallback(async (options = {}) => {
    try {
      const totals = await getTotalsServer(options);
      if (!pendingTransactions.length) return totals;
      const { mergePendingTotals } = await loadOfflineQueue();
      return mergePendingTotals(totals, serverTransactions, pendingTransactions, options);
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { computeOfflineTotals } = await loadOfflineQueue();
      return computeOfflineTotals(serverTransactions, pendingTransactions, options);
    }
  }, [getTotalsServer, pendingTransactions, serverTransactions]);

  const syncOfflineQueue = useCallback(async () => {
    if (!currentUser || syncingRef.current || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      return { synced: 0, failed: 0 };
    }
    if (!hasStoredOfflineQueue(currentUser.uid)) {
      setPendingTransactions([]);
      return { synced: 0, failed: 0 };
    }
    syncingRef.current = true;
    setSyncingOfflineQueue(true);
    try {
      const [{ flushOfflineQueue }, { TransactionService }] = await Promise.all([
        loadOfflineQueue(),
        import("../services/transactionService.jsx"),
      ]);
      const result = await flushOfflineQueue(
        currentUser.uid,
        (entry) => TransactionService.add(currentUser.uid, entry.payload, { requestId: entry.clientRequestId }),
        (remaining) => {
          setPendingTransactions(remaining);
          setQueueRevision((value) => value + 1);
        }
      );
      if (result.synced > 0) notification.success(t("offline.synced", { count: result.synced }));
      return result;
    } finally {
      syncingRef.current = false;
      setSyncingOfflineQueue(false);
    }
  }, [currentUser, notification, t]);

  useEffect(() => {
    if (!currentUser) return undefined;
    if (hasStoredOfflineQueue(currentUser.uid) && (typeof navigator === "undefined" || navigator.onLine !== false)) {
      syncOfflineQueue();
    }
    const handleOnline = () => {
      syncOfflineQueue();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [currentUser, syncOfflineQueue]);

  // Adds a transaction (queues locally when the device is offline)
  const addTransaction = useCallback(async (transactionData, { silent = false } = {}) => {
    if (!currentUser) return false;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      try {
        const { enqueueOfflineTransaction } = await loadOfflineQueue();
        const { clientRequestId, ...payload } = transactionData;
        const result = enqueueOfflineTransaction(currentUser.uid, payload, { requestId: clientRequestId });
        if (!result.ok) {
          notification.error(t(result.reason === "queue-full" ? "offline.queueFull" : "notifications.addError"));
          return false;
        }
        setPendingTransactions(result.pending);
        setQueueRevision((value) => value + 1);
        if (!silent) notification.info(t("offline.queuedSuccess"));
        return true;
      } catch (error) {
        console.error("Error queuing offline transaction:", error);
        notification.error(error.issues ? t("validation.invalidTransaction") : t("notifications.addError"));
        return false;
      }
    }

    beginProcessing();
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      const { clientRequestId, ...payload } = transactionData;
      await TransactionService.add(currentUser.uid, payload, { requestId: clientRequestId });
      if (!silent) {
        notification.success(t('notifications.addSuccess'));
        if (import.meta.env.MODE === "mobile") {
          import("../platform/appReview.js")
            .then(({ recordPositiveSaveAndMaybeRequestReview }) => recordPositiveSaveAndMaybeRequestReview({ isDemo: false }))
            .catch(() => {});
        }
      }
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
      endProcessing();
    }
  }, [currentUser, notification, t, beginProcessing, endProcessing]);

  // Updates a transaction
  const updateTransaction = useCallback(async (transactionId, updatedData) => {
    if (!currentUser) return false;
    
    beginProcessing();
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
      endProcessing();
    }
  }, [currentUser, notification, t, beginProcessing, endProcessing]);

  // Deletes a transaction; `silent` lets the caller show its own (undo) toast.
  const deleteTransaction = useCallback(async (transactionId, { silent = false } = {}) => {
    if (!currentUser) return false;
    
    beginProcessing();
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      await TransactionService.delete(transactionId);
      if (!silent) notification.success(t('notifications.deleteSuccess'));
      return true;
    } catch (error) {
      console.error("Error deleting transaction:", error);
      notification.error(t('notifications.deleteError'));
      return false;
    } finally {
      endProcessing();
    }
  }, [currentUser, notification, t, beginProcessing, endProcessing]);

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
    getTransactionTotals,
    getFirstTransactionDate,
    recentRevision,
    canAddMoreTransactions: true,
    maxTransactions: Infinity,
    getStats,
    isAuthenticated: true,
    pendingOfflineCount: pendingTransactions.length,
    syncingOfflineQueue,
    syncOfflineQueue,
  }), [
    transactions, loading, isProcessing, addTransaction, updateTransaction, deleteTransaction,
    fetchAllTransactions, fetchTransactionPage, getTotalTransactionCount, getTransactionTotals,
    getFirstTransactionDate, recentRevision, getStats, pendingTransactions.length, syncingOfflineQueue, syncOfflineQueue,
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
    revision,
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
    recentRevision: revision,
    canAddMoreTransactions,
    maxTransactions: MAX_DEMO_TRANSACTIONS,
    getStats: getDemoStats,
    isDemo: true,
    seedOnMount: seedDemo,
    startDemo,
    stopDemo,
  }), [
    transactions, revision, loading, addTransaction, updateTransaction, deleteTransaction,
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
    // Signed in but unverified: row level security would deny every read, so no
    // listener is opened and the UI sees an empty, authenticated state.
    if (hasUser) return { ...INERT_VALUE, isAuthenticated: true, startDemo, stopDemo };
    return { ...INERT_VALUE, startDemo, stopDemo };
  }, [isReady, hasUser, startDemo, stopDemo]);

  if (isReady && currentUser?.emailVerified) {
    return (
      <TransactionProvider>
        <AccountTransactionWrapper>
          {children}
        </AccountTransactionWrapper>
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

AccountTransactionWrapper.propTypes = {
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
