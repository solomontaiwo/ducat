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
import { DEMO_FLAG_KEY } from "../utils/demoStorage.js";
import { currentVault } from "../services/vaultSession.js";

const OFFLINE_QUEUE_PREFIX = "ducat-offline-queue:";
const OFFLINE_MUTATIONS_PREFIX = "ducat-offline-mutations:";
const hasStoredOfflineQueue = (userId) => Boolean(
  userId && (currentVault(userId) || readLocalValue(`${OFFLINE_QUEUE_PREFIX}${userId}`) || readLocalValue(`${OFFLINE_MUTATIONS_PREFIX}${userId}`))
);
const isDeviceOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const loadOfflineQueue = () => import("../utils/offlineQueue.js");
const runQueue = async (uid, operation, archive = currentVault(uid)) => {
  if (!archive) return operation();
  const { runVaultQueue } = await import("../services/vaultQueue.js");
  return runVaultQueue(uid, operation, archive);
};

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

// Wrapper for the signed-in (Supabase) provider
const AccountTransactionWrapper = ({ children, stopDemo }) => {
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
  const [pendingMutations, setPendingMutations] = useState([]);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const [offlineSyncFailed, setOfflineSyncFailed] = useState(false);
  const [lastOfflineSync, setLastOfflineSync] = useState(null);
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

  useEffect(() => {
    setOfflineSyncFailed(false);
    setLastOfflineSync(null);
  }, [currentUser?.uid]);

  const refreshPending = useCallback(async (uid) => {
    if (!hasStoredOfflineQueue(uid)) {
      setPendingTransactions([]);
      setPendingMutations([]);
      return [];
    }
    const { readOfflineQueue, readOfflineMutations, queuedItemToTransaction } = await loadOfflineQueue();
    const { items, mutations } = await runQueue(uid, (storage) => ({
      items: readOfflineQueue(uid, storage), mutations: readOfflineMutations(uid, storage),
    }));
    const mapped = items.map((item) => queuedItemToTransaction(uid, item));
    setPendingTransactions(mapped);
    setPendingMutations(mutations);
    return items;
  }, []);

  useEffect(() => {
    refreshPending(currentUser?.uid).catch((error) => console.error("Unable to read offline queue", error));
  }, [currentUser?.uid, refreshPending]);

  // Apply queued offline updates/deletes to server rows before merging queued adds.
  const effectiveServerTransactions = useMemo(() => {
    if (!pendingMutations.length) return serverTransactions;
    const deleted = new Set();
    const updates = new Map();
    for (const item of pendingMutations) {
      if (item.op === "delete") deleted.add(item.id);
      else if (item.op === "update") updates.set(item.id, item.patch);
    }
    return serverTransactions.flatMap((row) => {
      if (deleted.has(row.id)) return [];
      const patch = updates.get(row.id);
      if (!patch) return [row];
      const nextMinor = patch.amountMinor ?? row.amountMinor;
      return [{ ...row, ...patch, amountMinor: nextMinor, amount: minorToMajor(nextMinor), pendingSync: true }];
    });
  }, [pendingMutations, serverTransactions]);

  // Merge optimistic pending offline items ahead of server rows, deduplicating by id.
  const transactions = useMemo(() => {
    if (!pendingTransactions.length) return effectiveServerTransactions;
    const seen = new Set(effectiveServerTransactions.map((item) => item.id));
    const extras = pendingTransactions.filter((item) => !seen.has(item.id));
    return extras.length ? [...extras, ...effectiveServerTransactions] : effectiveServerTransactions;
  }, [pendingTransactions, effectiveServerTransactions]);

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
    if (!pendingTransactions.length && !pendingMutations.length) return remote;
    const { applyOfflineMutations, mergePendingTransactions } = await loadOfflineQueue();
    const mutated = applyOfflineMutations(remote, pendingMutations);
    return mergePendingTransactions(mutated, pendingTransactions, options);
  }, [fetchAllServer, pendingTransactions, pendingMutations, serverTransactions]);

  const fetchTransactionPage = useCallback(async (options = {}) => {
    try {
      const page = await fetchPageServer(options);
      if (!pendingTransactions.length && !pendingMutations.length) return page;
      const { applyOfflineMutations, mergePendingTransactions } = await loadOfflineQueue();
      const mutated = applyOfflineMutations(page.items, pendingMutations);
      return {
        ...page,
        items: options.cursor ? mutated : mergePendingTransactions(mutated, pendingTransactions, options),
      };
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { buildOfflinePage } = await loadOfflineQueue();
      return buildOfflinePage(effectiveServerTransactions, pendingTransactions, options);
    }
  }, [fetchPageServer, pendingTransactions, pendingMutations, effectiveServerTransactions]);

  const getVaultTotalsWithPending = useCallback(async (options) => {
    const { applyOfflineMutations, computeOfflineTotals } = await loadOfflineQueue();
    const server = await fetchAllServer();
    return computeOfflineTotals(applyOfflineMutations(server, pendingMutations), pendingTransactions, options);
  }, [fetchAllServer, pendingMutations, pendingTransactions]);

  const getTotalTransactionCount = useCallback(async (options = {}) => {
    try {
      if (currentVault(currentUser?.uid) && (pendingTransactions.length || pendingMutations.length)) {
        return (await getVaultTotalsWithPending(options)).count;
      }
      const count = await getTotalCountServer(options);
      if (!pendingTransactions.length && !pendingMutations.length) return count;
      const { mergePendingTotals } = await loadOfflineQueue();
      const deletedCount = pendingMutations.filter((item) => item.op === "delete").length;
      const base = Math.max(0, count - deletedCount);
      return mergePendingTotals({ count: base, incomeMinor: 0, expenseMinor: 0 }, effectiveServerTransactions, pendingTransactions, options).count;
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { computeOfflineTotals } = await loadOfflineQueue();
      return computeOfflineTotals(effectiveServerTransactions, pendingTransactions, options).count;
    }
  }, [currentUser?.uid, getVaultTotalsWithPending, getTotalCountServer, pendingTransactions, pendingMutations, effectiveServerTransactions]);

  const getTransactionTotals = useCallback(async (options = {}) => {
    try {
      if (currentVault(currentUser?.uid) && (pendingTransactions.length || pendingMutations.length)) {
        return getVaultTotalsWithPending(options);
      }
      const totals = await getTotalsServer(options);
      if (!pendingTransactions.length && !pendingMutations.length) return totals;
      if (pendingMutations.length) {
        const { computeOfflineTotals } = await loadOfflineQueue();
        return computeOfflineTotals(effectiveServerTransactions, pendingTransactions, options);
      }
      const { mergePendingTotals } = await loadOfflineQueue();
      return mergePendingTotals(totals, effectiveServerTransactions, pendingTransactions, options);
    } catch (error) {
      if (!isDeviceOffline()) throw error;
      const { computeOfflineTotals } = await loadOfflineQueue();
      return computeOfflineTotals(effectiveServerTransactions, pendingTransactions, options);
    }
  }, [currentUser?.uid, getVaultTotalsWithPending, getTotalsServer, pendingTransactions, pendingMutations, effectiveServerTransactions]);

  const syncOfflineQueue = useCallback(async () => {
    if (!currentUser || syncingRef.current || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      return { synced: 0, failed: 0 };
    }
    if (!hasStoredOfflineQueue(currentUser.uid)) {
      setPendingTransactions([]);
      setPendingMutations([]);
      return { synced: 0, failed: 0 };
    }
    const archive = currentVault(currentUser.uid);
    syncingRef.current = true;
    setSyncingOfflineQueue(true);
    setOfflineSyncFailed(false);
    try {
      const [{ flushOfflineQueue, flushOfflineMutations }, { TransactionService }] = await Promise.all([
        loadOfflineQueue(),
        import("../services/transactionService.jsx"),
      ]);
      const addResult = await flushOfflineQueue(
        currentUser.uid,
        (entry) => TransactionService.add(currentUser.uid, entry.payload, { requestId: entry.clientRequestId }),
        (remaining) => {
          setPendingTransactions(remaining);
          setQueueRevision((value) => value + 1);
        },
        (operation) => runQueue(currentUser.uid, operation, archive),
      );
      const mutResult = await flushOfflineMutations(
        currentUser.uid,
        {
          update: (id, patch) => TransactionService.update(id, patch),
          remove: (id) => TransactionService.delete(id),
        },
        (remaining) => {
          setPendingMutations(remaining);
          setQueueRevision((value) => value + 1);
        },
        (operation) => runQueue(currentUser.uid, operation, archive),
      );
      const totalSynced = addResult.synced + mutResult.synced;
      setOfflineSyncFailed(addResult.failed + mutResult.failed > 0);
      if (totalSynced > 0) setLastOfflineSync(Date.now());
      if (totalSynced > 0) notification.success(t("offline.synced", { count: totalSynced }));
      return { synced: totalSynced, failed: addResult.failed + mutResult.failed };
    } catch (error) {
      setOfflineSyncFailed(true);
      throw error;
    } finally {
      syncingRef.current = false;
      setSyncingOfflineQueue(false);
    }
  }, [currentUser, notification, t]);

  useEffect(() => {
    if (!currentUser) return undefined;
    if (hasStoredOfflineQueue(currentUser.uid) && (typeof navigator === "undefined" || navigator.onLine !== false)) {
      syncOfflineQueue().catch((error) => console.error("Unable to sync offline queue", error));
    }
    const handleOnline = () => {
      syncOfflineQueue().catch((error) => console.error("Unable to sync offline queue", error));
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
        const result = await runQueue(currentUser.uid, (storage) => enqueueOfflineTransaction(currentUser.uid, payload, { requestId: clientRequestId }, storage));
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

  // Bulk insert for CSV imports (single chunked upsert on Supabase).
  const addTransactionsBatch = useCallback(async (items = [], { onProgress } = {}) => {
    if (!currentUser || !items.length) return { imported: 0, failed: [] };
    if (isDeviceOffline()) {
      const failed = [];
      let imported = 0;
      for (const [index, item] of items.entries()) {
        if (await addTransaction(item, { silent: true })) imported += 1;
        else failed.push(item);
        onProgress?.(Math.round(((index + 1) / items.length) * 100));
      }
      return { imported, failed };
    }
    beginProcessing();
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      if (typeof TransactionService.addBatch === "function") {
        return await TransactionService.addBatch(currentUser.uid, items, { onProgress });
      }
      const failed = [];
      let imported = 0;
      for (const [index, item] of items.entries()) {
        if (await addTransaction(item, { silent: true })) imported += 1;
        else failed.push(item);
        onProgress?.(Math.round(((index + 1) / items.length) * 100));
      }
      return { imported, failed };
    } finally {
      endProcessing();
    }
  }, [currentUser, addTransaction, beginProcessing, endProcessing]);

  // Updates a transaction (edits local queue in-place if pendingSync, or queues an offline edit)
  const updateTransaction = useCallback(async (transactionId, updatedData, { silent = false } = {}) => {
    if (!currentUser) return false;

    if (pendingTransactions.some((item) => item.id === transactionId)) {
      try {
        const { updateOfflineTransaction } = await loadOfflineQueue();
        const result = await runQueue(currentUser.uid, (storage) => updateOfflineTransaction(currentUser.uid, transactionId, updatedData, storage));
        if (!result.ok) {
          if (!silent) notification.error(t("notifications.updateError"));
          return false;
        }
        setPendingTransactions(result.pending);
        setQueueRevision((value) => value + 1);
        if (!silent) notification.success(t("notifications.updateSuccess"));
        return true;
      } catch (error) {
        console.error("Error updating offline transaction:", error);
        if (!silent) notification.error(error.issues ? t("validation.invalidTransaction") : t("notifications.updateError"));
        return false;
      }
    }

    if (isDeviceOffline()) {
      try {
        const { enqueueOfflineUpdate } = await loadOfflineQueue();
        const result = await runQueue(currentUser.uid, (storage) => enqueueOfflineUpdate(currentUser.uid, transactionId, updatedData, storage));
        if (!result.ok) {
          if (!silent) notification.error(t(result.reason === "queue-full" ? "offline.queueFull" : "notifications.updateError"));
          return false;
        }
        setPendingMutations(result.mutations);
        setQueueRevision((value) => value + 1);
        if (!silent) notification.info(t("offline.queuedSuccess"));
        return true;
      } catch (error) {
        console.error("Error queuing offline update:", error);
        if (!silent) notification.error(error.issues ? t("validation.invalidTransaction") : t("notifications.updateError"));
        return false;
      }
    }

    beginProcessing();
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      await TransactionService.update(transactionId, updatedData);
      if (!silent) notification.success(t('notifications.updateSuccess'));
      return true;
    } catch (error) {
      console.error("Error updating transaction:", error);
      if (!silent) notification.error(t('notifications.updateError'));
      return false;
    } finally {
      endProcessing();
    }
  }, [currentUser, pendingTransactions, notification, t, beginProcessing, endProcessing]);

  // Deletes a transaction; `silent` lets the caller show its own (undo) toast.
  const deleteTransaction = useCallback(async (transactionId, { silent = false } = {}) => {
    if (!currentUser) return false;

    if (pendingTransactions.some((item) => item.id === transactionId)) {
      try {
        const { removeOfflineTransactionById } = await loadOfflineQueue();
        const result = await runQueue(currentUser.uid, (storage) => removeOfflineTransactionById(currentUser.uid, transactionId, storage));
        if (!result.removed) return false;
        setPendingTransactions(result.pending);
        setQueueRevision((value) => value + 1);
        if (!silent) notification.success(t("notifications.deleteSuccess"));
        return true;
      } catch (error) {
        console.error("Error deleting offline transaction:", error);
        notification.error(t("notifications.deleteError"));
        return false;
      }
    }

    if (isDeviceOffline()) {
      try {
        const { enqueueOfflineDelete } = await loadOfflineQueue();
        const result = await runQueue(currentUser.uid, (storage) => enqueueOfflineDelete(currentUser.uid, transactionId, storage));
        if (!result.ok) {
          if (!silent) notification.error(t(result.reason === "queue-full" ? "offline.queueFull" : "notifications.deleteError"));
          return false;
        }
        setPendingMutations(result.mutations);
        setQueueRevision((value) => value + 1);
        if (!silent) notification.info(t("offline.queuedSuccess"));
        return true;
      } catch (error) {
        console.error("Error queuing offline delete:", error);
        notification.error(t("notifications.deleteError"));
        return false;
      }
    }

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
  }, [currentUser, pendingTransactions, notification, t, beginProcessing, endProcessing]);

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
    addTransactionsBatch,
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
    // Lets the demo import end the local trial once its data reached the account.
    stopDemo,
    pendingOfflineCount: pendingTransactions.length + pendingMutations.length,
    syncingOfflineQueue,
    offlineSyncFailed,
    lastOfflineSync,
    syncOfflineQueue,
  }), [
    transactions, loading, isProcessing, addTransaction, addTransactionsBatch, updateTransaction, deleteTransaction,
    fetchAllTransactions, fetchTransactionPage, getTotalTransactionCount, getTransactionTotals,
    getFirstTransactionDate, recentRevision, getStats, stopDemo, pendingTransactions.length, pendingMutations.length, syncingOfflineQueue, offlineSyncFailed, lastOfflineSync, syncOfflineQueue,
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
        <AccountTransactionWrapper stopDemo={stopDemo}>
          {children}
        </AccountTransactionWrapper>
      </TransactionProvider>
    );
  }

  // Demo for signed-out visitors, and the local trial for someone who signed
  // up and is waiting for the confirmation email (there is no session yet, so
  // nothing can reach the account until the user confirms and signs in).
  if (isReady && (!currentUser || currentUser.pending) && demoEnabled) {
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
  stopDemo: PropTypes.func.isRequired,
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
