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
import { onLocalChange } from "../services/changeEvents.js";

const DEMO_RECURRING_KEY = "ducat-demo-recurring";
const DEMO_BUDGETS_KEY = "ducat-demo-budgets";
const DEMO_PREFERENCES_KEY = "ducat-demo-preferences";

const INERT = Object.freeze({
  recurring: [],
  budgets: {},
  preferences: DEFAULT_PREFERENCES,
  ready: false,
  error: "",
  retry: () => {},
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
  const parsed = JSON.parse(readLocalValue(key) || "null");
  return parsed ?? fallback;
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
  const [status, setStatus] = useState({ recurring: "loading", budgets: "loading", preferences: "loading" });
  const [loadErrors, setLoadErrors] = useState({});
  const [reloadRevision, setReloadRevision] = useState(0);
  const ready = Object.values(status).every((value) => value === "ready");
  const error = Object.keys(loadErrors).length ? t("planning.loadError") : "";
  const retry = useCallback(() => setReloadRevision((value) => value + 1), []);
  const statusRef = useRef(status);
  statusRef.current = status;
  const source = isDemo ? "demo" : userId;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const loadedSourceRef = useRef(null);
  const preferencesQueueRef = useRef(Promise.resolve());
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const recurringRef = useRef(recurring);
  recurringRef.current = recurring;

  useEffect(() => {
    setStatus({ recurring: "loading", budgets: "loading", preferences: "loading" });
    setLoadErrors({});
    if (loadedSourceRef.current !== source) {
      setRecurring([]);
      setBudgets({});
      setPreferences(DEFAULT_PREFERENCES);
      loadedSourceRef.current = source;
    }
    if (isDemo) {
      const loadDemo = () => {
        try {
          const rules = readDemo(DEMO_RECURRING_KEY, []);
          setRecurring(rules.map((rule) => ({ ...recurringInputSchema.parse(rule), id: rule.id })));
          setBudgets(budgetLimitsSchema.parse(readDemo(DEMO_BUDGETS_KEY, {})));
          setPreferences(normalizePreferences(readDemo(DEMO_PREFERENCES_KEY, {})));
          setLoadErrors({});
          setStatus({ recurring: "ready", budgets: "ready", preferences: "ready" });
        } catch (error) {
          console.error("Demo planning data unavailable", error);
          setLoadErrors({ demo: true });
          setStatus({ recurring: "error", budgets: "error", preferences: "error" });
        }
      };
      loadDemo();
      return onLocalChange("demo-recurring", loadDemo);
    }
    if (!userId) return undefined;

    let cancelled = false;
    let unsubscribers = [];
    const markLoaded = (topic) => {
      if (cancelled) return;
      setStatus((previous) => ({ ...previous, [topic]: "ready" }));
      setLoadErrors((previous) => { const next = { ...previous }; delete next[topic]; return next; });
    };
    const onError = (topic) => (error) => {
      if (cancelled) return;
      console.error("Planning data unavailable", error);
      setStatus((previous) => ({ ...previous, [topic]: "error" }));
      setLoadErrors((previous) => ({ ...previous, [topic]: true }));
    };
    import("../services/planningService.js").then(({ PlanningService }) => {
      if (cancelled) return;
      unsubscribers = [
        PlanningService.subscribeRecurring(userId, (rules) => {
          if (cancelled) return;
          setRecurring(rules);
          markLoaded("recurring");
        }, onError("recurring")),
        PlanningService.subscribeBudgets(userId, (limits) => {
          if (cancelled) return;
          setBudgets(budgetLimitsSchema.parse(limits));
          markLoaded("budgets");
        }, onError("budgets")),
        PlanningService.subscribePreferences(userId, (stored) => {
          if (cancelled) return;
          setPreferences(normalizePreferences(stored || {}));
          markLoaded("preferences");
        }, onError("preferences")),
      ];
    }).catch(onError("service"));
    return () => { cancelled = true; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [isDemo, userId, source, reloadRevision]);

  const writeDemoRecurring = useCallback((updater) => {
    const next = updater(recurringRef.current);
    if (!writeLocalValue(DEMO_RECURRING_KEY, JSON.stringify(next))) throw new Error("Demo storage unavailable");
    recurringRef.current = next;
    setRecurring(next);
  }, []);

  const addRecurring = useCallback(async (data) => {
    try {
      if (statusRef.current.recurring !== "ready") throw new Error("Recurring rules have not loaded");
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
      if (statusRef.current.recurring !== "ready") throw new Error("Recurring rules have not loaded");
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
      if (statusRef.current.recurring !== "ready") throw new Error("Recurring rules have not loaded");
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

  const registerRuleOccurrence = useCallback(async (rule, occurrence, silent = false) => {
    if (!mountedRef.current || sourceRef.current !== source || statusRef.current.recurring !== "ready") return { ok: false, created: false };
    try {
      if (isDemo) {
        const ok = await addTransaction({
          ...occurrencePayload(rule, occurrence.dateKey),
          recurringOccurrence: { id: rule.id, index: occurrence.index },
        }, { silent });
        return { ok, created: ok };
      }
      if (!userId) return { ok: false, created: false };
      const { PlanningService } = await import("../services/planningService.js");
      if (!mountedRef.current || sourceRef.current !== source) return { ok: false, created: false };
      const created = await PlanningService.registerOccurrence(rule.id, occurrence.index);
      if (sourceRef.current === userId) {
        setRecurring((rules) => rules.map((stored) => stored.id === rule.id
          ? { ...stored, nextIndex: Math.max(stored.nextIndex, occurrence.index + 1) }
          : stored));
      }
      return { ok: true, created };
    } catch (error) {
      console.error("Unable to register recurring occurrence", error);
      notification.error(t("recurring.saveError"));
      return { ok: false, created: false };
    }
  }, [isDemo, userId, source, addTransaction, notification, t]);

  const registerOccurrence = useCallback(async (rule) => {
    const result = await registerRuleOccurrence(rule, nextOccurrence(rule));
    if (result.ok && !isDemo) notification.success(t("notifications.addSuccess"));
    return result.ok;
  }, [registerRuleOccurrence, isDemo, notification, t]);

  const skipOccurrence = useCallback(
    (rule) => updateRecurring(rule.id, { nextIndex: rule.nextIndex + 1 }),
    [updateRecurring]
  );

  const saveBudgets = useCallback(async (limits) => {
    try {
      if (statusRef.current.budgets !== "ready") throw new Error("Budgets have not loaded");
      const parsed = budgetLimitsSchema.parse(limits);
      if (isDemo) {
        if (!writeLocalValue(DEMO_BUDGETS_KEY, JSON.stringify(parsed))) throw new Error("Demo storage unavailable");
        setBudgets(parsed);
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
  const savePreferences = useCallback((patch) => {
    const task = preferencesQueueRef.current.then(async () => {
      try {
        if (sourceRef.current !== source || statusRef.current.preferences !== "ready") {
          throw new Error("Preferences have not loaded");
        }
        const parsedPatch = preferencesSchema.partial().parse(patch);
        let next = preferencesSchema.parse({ ...preferencesRef.current, ...parsedPatch });
        if (isDemo) {
          if (!writeLocalValue(DEMO_PREFERENCES_KEY, JSON.stringify(next))) throw new Error("Demo storage unavailable");
        } else if (userId) {
          const { PlanningService } = await import("../services/planningService.js");
          if (!mountedRef.current || sourceRef.current !== source) return false;
          next = normalizePreferences(await PlanningService.savePreferences(userId, parsedPatch));
        } else {
          return false;
        }
        if (sourceRef.current !== source) return false;
        preferencesRef.current = next;
        setPreferences(next);
        return true;
      } catch (error) {
        console.error("Unable to save preferences", error);
        notification.error(t("preferences.saveError"));
        return false;
      }
    });
    preferencesQueueRef.current = task;
    return task;
  }, [isDemo, userId, source, notification, t]);

  // Register the occurrences of automatic rules that came due while the app
  // was closed. Deterministic request ids keep this safe across devices.
  const catchingUpRef = useRef(false);
  const [catchUpRevision, setCatchUpRevision] = useState(0);
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
      let succeeded = true;
      for (const { rule, due } of work) {
        for (const occurrence of due) {
          if (!mountedRef.current || sourceRef.current !== source) return;
          const result = await registerRuleOccurrence(rule, occurrence, true);
          if (!result.ok) { succeeded = false; break; }
          if (result.created) registered += 1;
        }
      }
      if (registered && mountedRef.current && sourceRef.current === source) notification.info(t("recurring.autoRegistered", { count: registered }));
      return succeeded;
    })().then((succeeded) => {
      catchingUpRef.current = false;
      if (mountedRef.current && (succeeded || sourceRef.current !== source)) setCatchUpRevision((value) => value + 1);
    }).catch((error) => {
      catchingUpRef.current = false;
      console.error("Recurring catch-up failed", error);
    });
  }, [ready, recurring, source, registerRuleOccurrence, catchUpRevision, notification, t]);

  const value = useMemo(() => ({
    recurring, budgets, preferences, ready, error, retry,
    addRecurring, updateRecurring, deleteRecurring, registerOccurrence, skipOccurrence, saveBudgets, savePreferences,
  }), [recurring, budgets, preferences, ready, error, retry, addRecurring, updateRecurring, deleteRecurring, registerOccurrence, skipOccurrence, saveBudgets, savePreferences]);

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
};

PlanningProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default PlanningProvider;
