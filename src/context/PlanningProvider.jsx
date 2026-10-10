import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthProvider.jsx";
import { useUnifiedTransactions } from "./UnifiedTransactionProvider.jsx";
import { useNotification } from "../utils/notificationUtils.jsx";
import { readLocalValue, writeLocalValue } from "../utils/storage.js";
import { dateKeyToDate, todayDateKey } from "../utils/dateUtils.js";
import { minorToMajor } from "../utils/money.js";
import { dueOccurrences, nextOccurrence, occurrenceRequestId } from "../utils/recurrence.js";
import { DEFAULT_PREFERENCES, budgetLimitsSchema, normalizePreferences, preferencesSchema, recurringInputSchema } from "../schemas/planning.js";

const DEMO_RECURRING_KEY = "soldi-sotto-demo-recurring";
const DEMO_BUDGETS_KEY = "soldi-sotto-demo-budgets";
const DEMO_PREFERENCES_KEY = "soldi-sotto-demo-preferences";

const INERT = Object.freeze({
  recurring: [],
  budgets: {},
  preferences: DEFAULT_PREFERENCES,
  ready: false,
  addRecurring: async () => false,
  updateRecurring: async () => false,
  deleteRecurring: async () => false,
  registerOccurrence: async () => false,
  skipOccurrence: async () => false,
  saveBudgets: async () => false,
  savePreferences: async () => false,
});

const PlanningContext = createContext(INERT);

export const usePlanning = () => useContext(PlanningContext);

const readDemo = (key, fallback) => {
  try {
    const parsed = JSON.parse(readLocalValue(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const occurrencePayload = (rule, dateKey) => ({
  type: rule.type,
  amountMinor: rule.amountMinor,
  amount: minorToMajor(rule.amountMinor),
  description: rule.description,
  category: rule.category,
  dateKey,
  date: dateKeyToDate(dateKey),
  clientRequestId: occurrenceRequestId(rule.id, dateKey),
});

/**
 * Recurring movements and monthly budgets. Supabase for verified accounts,
 * local storage in demo mode. Automatic rules are registered here, on the
 * device, when the app opens, so no scheduled job is needed.
 */
export const PlanningProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { isDemo, addTransaction } = useUnifiedTransactions();
  const notification = useNotification();
  const { t } = useTranslation();
  const userId = !isDemo && currentUser?.emailVerified ? currentUser.uid : null;

  const [recurring, setRecurring] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const recurringRef = useRef(recurring);
  recurringRef.current = recurring;

  useEffect(() => {
    setReady(false);
    if (isDemo) {
      setRecurring(readDemo(DEMO_RECURRING_KEY, []));
      setBudgets(readDemo(DEMO_BUDGETS_KEY, {}));
      setPreferences(normalizePreferences(readDemo(DEMO_PREFERENCES_KEY, {})));
      setReady(true);
      return undefined;
    }
    setRecurring([]);
    setBudgets({});
    setPreferences(DEFAULT_PREFERENCES);
    if (!userId) return undefined;

    let cancelled = false;
    let unsubscribers = [];
    let loaded = 0;
    const markLoaded = () => { loaded += 1; if (loaded === 3 && !cancelled) setReady(true); };
    import("../services/planningService.js").then(({ PlanningService }) => {
      if (cancelled) return;
      const onError = (error) => { console.error("Planning data unavailable", error); markLoaded(); };
      let recurringSeen = false;
      let budgetsSeen = false;
      let preferencesSeen = false;
      unsubscribers = [
        PlanningService.subscribeRecurring(userId, (rules) => {
          setRecurring(rules);
          if (!recurringSeen) { recurringSeen = true; markLoaded(); }
        }, onError),
        PlanningService.subscribeBudgets(userId, (limits) => {
          setBudgets(limits);
          if (!budgetsSeen) { budgetsSeen = true; markLoaded(); }
        }, onError),
        PlanningService.subscribePreferences(userId, (stored) => {
          setPreferences(normalizePreferences(stored || {}));
          if (!preferencesSeen) { preferencesSeen = true; markLoaded(); }
        }, onError),
      ];
    }).catch((error) => console.error("Unable to load planning service", error));
    return () => { cancelled = true; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [isDemo, userId]);

  const writeDemoRecurring = useCallback((updater) => {
    const next = updater(recurringRef.current);
    recurringRef.current = next;
    setRecurring(next);
    writeLocalValue(DEMO_RECURRING_KEY, JSON.stringify(next));
  }, []);

  const addRecurring = useCallback(async (data) => {
    try {
      const input = recurringInputSchema.parse({ currency: "EUR", nextIndex: 1, paused: false, ...data });
      if (isDemo) {
        writeDemoRecurring((rules) => [...rules, { ...input, id: crypto.randomUUID() }]);
      } else if (userId) {
        const { PlanningService } = await import("../services/planningService.js");
        await PlanningService.addRecurring(userId, input);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Unable to save recurring rule", error);
      notification.error(t("recurring.saveError"));
      return false;
    }
  }, [isDemo, userId, writeDemoRecurring, notification, t]);

  const updateRecurring = useCallback(async (id, patch) => {
    try {
      if (isDemo) {
        writeDemoRecurring((rules) => rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
      } else if (userId) {
        const { PlanningService } = await import("../services/planningService.js");
        await PlanningService.updateRecurring(id, patch);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Unable to update recurring rule", error);
      notification.error(t("recurring.saveError"));
      return false;
    }
  }, [isDemo, userId, writeDemoRecurring, notification, t]);

  const deleteRecurring = useCallback(async (id) => {
    try {
      if (isDemo) {
        writeDemoRecurring((rules) => rules.filter((rule) => rule.id !== id));
      } else if (userId) {
        const { PlanningService } = await import("../services/planningService.js");
        await PlanningService.deleteRecurring(id);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Unable to delete recurring rule", error);
      notification.error(t("recurring.saveError"));
      return false;
    }
  }, [isDemo, userId, writeDemoRecurring, notification, t]);

  const registerOccurrence = useCallback(async (rule) => {
    const { index, dateKey } = nextOccurrence(rule);
    if (!(await addTransaction(occurrencePayload(rule, dateKey)))) return false;
    return updateRecurring(rule.id, { nextIndex: index + 1 });
  }, [addTransaction, updateRecurring]);

  const skipOccurrence = useCallback(
    (rule) => updateRecurring(rule.id, { nextIndex: rule.nextIndex + 1 }),
    [updateRecurring]
  );

  const saveBudgets = useCallback(async (limits) => {
    try {
      const parsed = budgetLimitsSchema.parse(limits);
      if (isDemo) {
        setBudgets(parsed);
        writeLocalValue(DEMO_BUDGETS_KEY, JSON.stringify(parsed));
      } else if (userId) {
        const { PlanningService } = await import("../services/planningService.js");
        await PlanningService.saveBudgets(userId, parsed);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Unable to save budgets", error);
      notification.error(t("budgets.saveError"));
      return false;
    }
  }, [isDemo, userId, notification, t]);

  /** Merges a partial change into the preferences and saves the result. */
  const savePreferences = useCallback(async (patch) => {
    try {
      const next = preferencesSchema.parse({ ...preferencesRef.current, ...patch });
      preferencesRef.current = next;
      setPreferences(next);
      if (isDemo) {
        writeLocalValue(DEMO_PREFERENCES_KEY, JSON.stringify(next));
      } else if (userId) {
        const { PlanningService } = await import("../services/planningService.js");
        await PlanningService.savePreferences(userId, next);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Unable to save preferences", error);
      notification.error(t("preferences.saveError"));
      return false;
    }
  }, [isDemo, userId, notification, t]);

  // Register the occurrences of automatic rules that came due while the app
  // was closed. Deterministic request ids keep this safe across devices.
  const catchingUpRef = useRef(false);
  useEffect(() => {
    if (!ready || catchingUpRef.current) return;
    const today = todayDateKey();
    const work = recurring
      .filter((rule) => rule.mode === "auto")
      .map((rule) => ({ rule, due: dueOccurrences(rule, today) }))
      .filter((item) => item.due.length);
    if (!work.length) return;

    catchingUpRef.current = true;
    (async () => {
      let registered = 0;
      for (const { rule, due } of work) {
        let lastIndex = null;
        for (const occurrence of due) {
          if (!(await addTransaction(occurrencePayload(rule, occurrence.dateKey), { silent: true }))) break;
          lastIndex = occurrence.index;
          registered += 1;
        }
        if (lastIndex !== null) await updateRecurring(rule.id, { nextIndex: lastIndex + 1 });
      }
      if (registered) notification.info(t("recurring.autoRegistered", { count: registered }));
    })().finally(() => { catchingUpRef.current = false; });
  }, [ready, recurring, addTransaction, updateRecurring, notification, t]);

  const value = useMemo(() => ({
    recurring, budgets, preferences, ready,
    addRecurring, updateRecurring, deleteRecurring, registerOccurrence, skipOccurrence, saveBudgets, savePreferences,
  }), [recurring, budgets, preferences, ready, addRecurring, updateRecurring, deleteRecurring, registerOccurrence, skipOccurrence, saveBudgets, savePreferences]);

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
};

PlanningProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default PlanningProvider;
