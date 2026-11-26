import { readLocalValue, removeLocalValue, writeLocalValue } from "./storage.js";

/**
 * Local storage used by the demo, which is also the "try it while you wait"
 * mode for someone who signed up and has not confirmed the email yet. These
 * values never leave the device until the user imports them into an account.
 */
export const DEMO_FLAG_KEY = "ducat-demo-enabled";
export const DEMO_TRANSACTIONS_KEY = "ducat-demo-transactions";
export const DEMO_RECURRING_KEY = "ducat-demo-recurring";
export const DEMO_BUDGETS_KEY = "ducat-demo-budgets";
export const DEMO_PREFERENCES_KEY = "ducat-demo-preferences";

const DEMO_KEYS = [
  DEMO_FLAG_KEY, DEMO_TRANSACTIONS_KEY, DEMO_RECURRING_KEY, DEMO_BUDGETS_KEY, DEMO_PREFERENCES_KEY,
];

/** Movements the user entered in the demo; the seeded examples are left out. */
export const readImportableDemoTransactions = () => {
  try {
    const parsed = JSON.parse(readLocalValue(DEMO_TRANSACTIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object" && !item.isSample && item.id) : [];
  } catch {
    return [];
  }
};

/**
 * Keeps only the movements whose ids are not listed, so a partly failed import
 * leaves on the device exactly what is still missing from the account.
 */
export const removeDemoTransactions = (ids) => {
  const remove = new Set(ids);
  try {
    const parsed = JSON.parse(readLocalValue(DEMO_TRANSACTIONS_KEY) || "[]");
    if (!Array.isArray(parsed)) return false;
    return writeLocalValue(DEMO_TRANSACTIONS_KEY, JSON.stringify(parsed.filter((item) => !remove.has(item?.id))));
  } catch {
    return false;
  }
};

/** Ends the demo and forgets everything it stored on this device. */
export const clearDemoData = () => DEMO_KEYS.map(removeLocalValue).every(Boolean);
