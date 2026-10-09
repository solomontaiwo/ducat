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
    import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";

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
  const addDemoTransaction = useCallback(async (transactionData) => {
    const userTransactionCount = demoTransactions.filter(t => !t.isSample).length;
    if (userTransactionCount >= MAX_DEMO_TRANSACTIONS) {
      notification.warning(t('demo.limitReached', { limit: MAX_DEMO_TRANSACTIONS }));
      return false;
    }

    const newTransaction = normalizeDemoTransaction({
      ...transactionData,
      amountMinor: Number.isSafeInteger(transactionData.amountMinor)
        ? transactionData.amountMinor
        : parseMoneyToMinor(transactionData.amount),
      dateKey: transactionData.dateKey || coerceDateKey(transactionData.date),
      id: crypto.randomUUID(),
      createdAt: new Date(),
      isSample: false, 
    });

    const updatedTransactions = [newTransaction, ...demoTransactions];
    setDemoTransactions(updatedTransactions);
    saveDemoTransactions(updatedTransactions);
    
    notification.success(t('demo.transactionAdded'));
    return true;
  }, [demoTransactions, saveDemoTransactions, notification, t]);

  // Updates an existing demo transaction
  const updateDemoTransaction = useCallback(async (transactionId, updatedData) => {
    const updatedTransactions = demoTransactions.map(transaction =>
      transaction.id === transactionId
        ? normalizeDemoTransaction({ ...transaction, ...updatedData })
        : transaction
    );
    setDemoTransactions(updatedTransactions);
    saveDemoTransactions(updatedTransactions);
    notification.success(t('demo.transactionUpdated'));
    return true;
  }, [demoTransactions, saveDemoTransactions, notification, t]);

  // Deletes a demo transaction
  const deleteDemoTransaction = useCallback(async (transactionId) => {
    const updatedTransactions = demoTransactions.filter(
      transaction => transaction.id !== transactionId
    );
    setDemoTransactions(updatedTransactions);
    saveDemoTransactions(updatedTransactions);
    notification.success(t('demo.transactionDeleted'));
    return true;
  }, [demoTransactions, saveDemoTransactions, notification, t]);

  // Clears all demo transactions
  const clearDemoTransactions = useCallback(() => {
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
    setDemoTransactions(normalizedSamples);
    saveDemoTransactions(normalizedSamples);
    notification.info(t('demo.sampleTransactionsAdded'));
  }, [saveDemoTransactions, notification, t]);

  useEffect(() => {
    loadDemoTransactions();
  }, [loadDemoTransactions]);

  // If demo was just activated and no transactions exist, generate samples
  useEffect(() => {
    if (seedOnMount && !hasSeededRef.current) {
      if (demoTransactions.length === 0) {
        generateSampleTransactions();
      }
      hasSeededRef.current = true;
    }
  }, [seedOnMount, demoTransactions.length, generateSampleTransactions]);

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
