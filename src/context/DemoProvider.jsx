import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
      useRef,
    } from "react";
    import { useNotification } from "../utils/notificationUtils.jsx";
    import PropTypes from "prop-types";
    import { useTranslation } from 'react-i18next';
    import { transactionV2InputSchema } from "../schemas/transaction.jsx";
    import { DEFAULT_CURRENCY, getTransactionAmountMinor, minorToMajor, parseMoneyToMinor } from "../utils/money.js";
    import { coerceDateKey, dateKeyToDate, todayDateKey } from "../utils/dateUtils.js";
    import { readLocalValue, removeLocalValue, writeLocalValue, writeLocalBatch } from "../utils/storage.js";

import { recurringDraftSchema, recurringInputSchema } from "../schemas/planning.js";
import { occurrenceDateKey, occurrenceRequestId } from "../utils/recurrence.js";
import { emitLocalChange } from "../services/changeEvents.js";

const DEMO_RECURRING_KEY = "soldi-sotto-demo-recurring";
const DemoContext = createContext();

export const useDemo = () => useContext(DemoContext);

const DEMO_STORAGE_KEY = "soldi-sotto-demo-transactions";
export const MAX_DEMO_TRANSACTIONS = 10;

const normalizeDemoTransaction = (transaction) => {
  const amountMinor = getTransactionAmountMinor(transaction);
  const dateKey = transaction.dateKey || coerceDateKey(transaction.date);
  const input = transactionV2InputSchema.parse({
    amountMinor,
    currency: transaction.currency || DEFAULT_CURRENCY,
    description: transaction.description,
    dateKey,
    category: transaction.category,
    type: transaction.type,
  });
  return {
    ...transaction,
    ...input,
    amount: minorToMajor(input.amountMinor),
    date: dateKeyToDate(input.dateKey),
    schemaVersion: 2,
  };
};

export const DemoProvider = ({ children, seedOnMount = false }) => {
  const [demoTransactions, setDemoTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasSeededRef = useRef(false);
  // Latest list, so several adds in a row (recurring catch-up) don't overwrite each other.
  const latestRef = useRef(demoTransactions);
  latestRef.current = demoTransactions;
  const notification = useNotification();
  const { t } = useTranslation();

  // Load demo transactions from localStorage
  const loadDemoTransactions = useCallback(() => {
    try {
      const savedTransactions = readLocalValue(DEMO_STORAGE_KEY);
      if (savedTransactions) {
        const parsed = JSON.parse(savedTransactions);
        if (!Array.isArray(parsed)) throw new Error("Invalid demo cache");
        const transactions = parsed.map(normalizeDemoTransaction);
        // Sort by date descending
        transactions.sort((a, b) => b.date - a.date);
        latestRef.current = transactions;
        setDemoTransactions(transactions);
      }
    } catch (error) {
      console.error("Error loading demo transactions:", error);
      setDemoTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save demo transactions to localStorage
  const saveDemoTransactions = useCallback((transactions) => {
    try {
      if (!writeLocalValue(DEMO_STORAGE_KEY, JSON.stringify(transactions))) {
        throw new Error("Demo storage unavailable");
      }
    } catch (error) {
      console.error("Error saving demo transactions:", error);
    }
  }, []);

  // Adds a new demo transaction
  const addDemoTransaction = useCallback(async (transactionData, { silent = false } = {}) => {
    try {
      const current = latestRef.current;
      const rules = transactionData.recurring || transactionData.recurringOccurrence
        ? JSON.parse(readLocalValue(DEMO_RECURRING_KEY) || "[]") : [];
      if (!Array.isArray(rules)) throw new Error("Invalid recurring cache");
      let nextRules = rules;
      let payload = transactionData;
      let id = transactionData.clientRequestId || crypto.randomUUID();
      if (transactionData.recurringOccurrence) {
        const { id: ruleId, index } = transactionData.recurringOccurrence;
        const rule = rules.find((item) => item.id === ruleId);
        if (!rule || !Number.isInteger(index) || index < 0 || index >= 10000) throw new Error("Invalid occurrence");
        if (index < rule.nextIndex) return true;
        if (rule.paused || index !== rule.nextIndex) throw new Error("Occurrence changed");
        const dateKey = occurrenceDateKey(rule.anchorDateKey, rule.frequency, index);
        payload = { ...rule, dateKey };
        id = occurrenceRequestId(rule.id, dateKey);
        nextRules = rules.map((item) => item.id === ruleId ? { ...item, nextIndex: index + 1 } : item);
      }
      const existing = current.find((item) => item.id === id);
      if (existing && !transactionData.recurringOccurrence && !transactionData.recurring) return true;
      if (!existing && current.filter((item) => !item.isSample).length >= MAX_DEMO_TRANSACTIONS) {
        notification.warning(t('demo.limitReached', { limit: MAX_DEMO_TRANSACTIONS }));
        return false;
      }
      const newTransaction = existing || normalizeDemoTransaction({
        ...payload,
        amountMinor: Number.isSafeInteger(payload.amountMinor) ? payload.amountMinor : parseMoneyToMinor(payload.amount),
        dateKey: payload.dateKey || coerceDateKey(payload.date),
        id,
        createdAt: new Date(),
        isSample: false,
      });
      if (transactionData.recurring) {
        const draft = recurringDraftSchema.parse(transactionData.recurring);
        const input = recurringInputSchema.parse({
          ...newTransaction, ...draft, anchorDateKey: newTransaction.dateKey, nextIndex: 1, paused: false,
        });
        if (!rules.some((rule) => rule.id === draft.id)) nextRules = [...rules, { ...input, id: draft.id }];
      }
      const updatedTransactions = existing ? current : [newTransaction, ...current];
      const entries = [[DEMO_STORAGE_KEY, JSON.stringify(updatedTransactions)]];
      if (nextRules !== rules) entries.push([DEMO_RECURRING_KEY, JSON.stringify(nextRules)]);
      if (!writeLocalBatch(entries)) throw new Error("Demo storage unavailable");
      latestRef.current = updatedTransactions;
      setDemoTransactions(updatedTransactions);
      if (nextRules !== rules) emitLocalChange("demo-recurring");
      if (!silent) notification.success(t('demo.transactionAdded'));
      return true;
    } catch (error) {
      console.error("Unable to save demo transaction", error);
      notification.error(t('notifications.addError'));
      return false;
    }
  }, [notification, t]);

  // Updates an existing demo transaction
  const updateDemoTransaction = useCallback(async (transactionId, updatedData) => {
    const updatedTransactions = demoTransactions.map(transaction =>
      transaction.id === transactionId
        ? normalizeDemoTransaction({ ...transaction, ...updatedData })
        : transaction
    );
    latestRef.current = updatedTransactions;
    setDemoTransactions(updatedTransactions);
    saveDemoTransactions(updatedTransactions);
    notification.success(t('demo.transactionUpdated'));
    return true;
  }, [demoTransactions, saveDemoTransactions, notification, t]);

  // Deletes a demo transaction; `silent` lets the caller show its own (undo) toast.
  const deleteDemoTransaction = useCallback(async (transactionId, { silent = false } = {}) => {
    const updatedTransactions = demoTransactions.filter(
      transaction => transaction.id !== transactionId
    );
    latestRef.current = updatedTransactions;
    setDemoTransactions(updatedTransactions);
    saveDemoTransactions(updatedTransactions);
    if (!silent) notification.success(t('demo.transactionDeleted'));
    return true;
  }, [demoTransactions, saveDemoTransactions, notification, t]);

  // Clears all demo transactions
  const clearDemoTransactions = useCallback(() => {
    latestRef.current = [];
    setDemoTransactions([]);
    removeLocalValue(DEMO_STORAGE_KEY);
    notification.success(t('demo.allTransactionsCleared'));
  }, [notification, t]);

  // Checks if user can add more transactions (excluding samples)
  const canAddMoreTransactions = demoTransactions.filter(t => !t.isSample).length < MAX_DEMO_TRANSACTIONS;

  // Demo statistics
  const getDemoStats = useCallback(() => {
    const totalIncome = demoTransactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + getTransactionAmountMinor(t), 0);
    
    const totalExpense = demoTransactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + getTransactionAmountMinor(t), 0);

    const userTransactionCount = demoTransactions.filter(t => !t.isSample).length;

    return {
      totalIncome: minorToMajor(totalIncome),
      totalExpense: minorToMajor(totalExpense),
      balance: minorToMajor(totalIncome - totalExpense),
      transactionCount: userTransactionCount,
      maxTransactions: MAX_DEMO_TRANSACTIONS,
      canAddMore: userTransactionCount < MAX_DEMO_TRANSACTIONS,
    };
  }, [demoTransactions]);

  // Generate some sample transactions if none exist
  const generateSampleTransactions = useCallback(() => {
    const today = new Date();
    const dateKey = todayDateKey();
    const sampleTransactions = [
      {
        id: "demo-1",
        type: "income",
        amount: 2500,
        amountMinor: 250000,
        description: t('demo.sampleSalary'),
        date: today,
        dateKey,
        currency: DEFAULT_CURRENCY,
        category: "stipendio",
        createdAt: new Date(),
        isSample: true,
      },
      {
        id: "demo-2",
        type: "expense",
        amount: 50,
        amountMinor: 5000,
        description: t('demo.sampleGroceries'),
        date: today,
        dateKey,
        currency: DEFAULT_CURRENCY,
        category: "supermercato",
        createdAt: new Date(),
        isSample: true,
      },
      {
        id: "demo-3",
        type: "expense",
        amount: 25,
        amountMinor: 2500,
        description: t('demo.sampleFuel'),
        date: today,
        dateKey,
        currency: DEFAULT_CURRENCY,
        category: "trasporti",
        createdAt: new Date(),
        isSample: true,
      },
    ];

    const normalizedSamples = sampleTransactions.map(normalizeDemoTransaction);
    latestRef.current = normalizedSamples;
    setDemoTransactions(normalizedSamples);
    saveDemoTransactions(normalizedSamples);
    notification.info(t('demo.sampleTransactionsAdded'));
  }, [saveDemoTransactions, notification, t]);

  useEffect(() => {
    loadDemoTransactions();
  }, [loadDemoTransactions]);

  // If demo was just activated and no transactions exist, generate samples
  useEffect(() => {
    if (!loading && seedOnMount && !hasSeededRef.current) {
      if (demoTransactions.length === 0) {
        generateSampleTransactions();
      }
      hasSeededRef.current = true;
    }
  }, [loading, seedOnMount, demoTransactions.length, generateSampleTransactions]);

  const value = useMemo(() => ({
    transactions: demoTransactions,
    loading,
    addTransaction: addDemoTransaction,
    updateTransaction: updateDemoTransaction,
    deleteTransaction: deleteDemoTransaction,
    clearTransactions: clearDemoTransactions,
    generateSampleTransactions,
    canAddMoreTransactions,
    maxTransactions: MAX_DEMO_TRANSACTIONS,
    getDemoStats,
    isDemo: true,
  }), [
    demoTransactions, loading, addDemoTransaction, updateDemoTransaction, deleteDemoTransaction,
    clearDemoTransactions, generateSampleTransactions, canAddMoreTransactions, getDemoStats,
  ]);

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
};

DemoProvider.propTypes = {
  children: PropTypes.node.isRequired,
  seedOnMount: PropTypes.bool,
};

export default DemoProvider;
