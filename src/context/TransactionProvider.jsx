import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
  import { useAuth } from "./AuthProvider";
  import PropTypes from "prop-types";
  
  const TransactionContext = createContext();
export const useTransactions = () => useContext(TransactionContext);

export const TransactionProvider = ({ children }) => {
  TransactionProvider.propTypes = {
    children: PropTypes.node.isRequired,
  };
  const { currentUser } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch recent transactions for the UI (limit 50)
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setTransactions([]);
      return;
    }

    setLoading(true);
    
    // Use service to subscribe to recent transactions
    let unsubscribe = () => {};
    let cancelled = false;
    import("../services/transactionService.jsx").then(({ TransactionService }) => {
      if (cancelled) return;
      unsubscribe = TransactionService.subscribeToRecent(currentUser.uid, 50,
        (data) => { setTransactions(data); setLoading(false); },
        (error) => { console.error("Error fetching transactions:", error); setLoading(false); }
      );
    }).catch((error) => { console.error("Error loading transaction service:", error); setLoading(false); });

    return () => { cancelled = true; unsubscribe(); };
  }, [currentUser]);

  // Expose a way to fetch all transactions for analytics if needed
  const fetchAllTransactions = useCallback(async (options = {}) => {
    if (!currentUser) return [];
    const { TransactionService } = await import("../services/transactionService.jsx");
    return TransactionService.fetchAll(currentUser.uid, options);
  }, [currentUser]);

  const getTotalTransactionCount = useCallback(async (options = {}) => {
    if (!currentUser) return 0;
    const { TransactionService } = await import("../services/transactionService.jsx");
    return TransactionService.getTotalCount(currentUser.uid, options);
  }, [currentUser]);

  return (
    <TransactionContext.Provider value={{ transactions, loading, fetchAllTransactions, getTotalTransactionCount }}>
      {children}
    </TransactionContext.Provider>
  );
};
