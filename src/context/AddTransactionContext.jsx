import { createContext, useContext } from "react";

/** Lets any page open the shared "new transaction" sheet owned by the layout. */
export const AddTransactionContext = createContext({ openAddTransaction: () => {}, canAdd: true });

export const useAddTransaction = () => useContext(AddTransactionContext);
