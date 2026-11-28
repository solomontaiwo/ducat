import { useSyncExternalStore } from "react";
import { getAccountCurrency, subscribeAccountCurrency } from "../utils/currency.js";

/**
 * The active account's currency. Components that format amounts call it so
 * they render again when the currency changes, even without reading the
 * planning context.
 */
export const useAccountCurrency = () => useSyncExternalStore(subscribeAccountCurrency, getAccountCurrency, getAccountCurrency);

export default useAccountCurrency;
