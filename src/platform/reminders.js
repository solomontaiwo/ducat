/**
 * Native iOS local notifications for upcoming recurring rules (`mode === "confirm"`).
 *
 * Uses `NativeFeaturesPlugin.swift` (`UNUserNotificationCenter`) on iOS so
 * reminders work completely on-device without any push server. On web and
 * desktop every call is a safe no-op.
 */

import { registerPlugin } from "@capacitor/core";
import { subDays } from "date-fns";
import { MOBILE, runtime } from "./index.js";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";
import { dateKeyToDate, todayDateKey } from "../utils/dateUtils.js";
import { nextOccurrence } from "../utils/recurrence.js";
import { minorToMajor } from "../utils/money.js";

export const REMINDERS_ENABLED_KEY = "ducat-recurring-reminders";
const DEFAULT_REMINDER_HOUR = 9;
const DEFAULT_REMINDER_MINUTE = 0;

let cachedPlugin = null;

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  if (!cachedPlugin) cachedPlugin = registerPlugin("NativeFeatures");
  return cachedPlugin;
};

export const isRecurringRemindersEnabled = () => (
  runtime() === MOBILE && readLocalValue(REMINDERS_ENABLED_KEY) === "true"
);

export const setRecurringRemindersEnabled = (enabled) => {
  if (enabled) writeLocalValue(REMINDERS_ENABLED_KEY, "true");
  else removeLocalValue(REMINDERS_ENABLED_KEY);
};

/**
 * Pure schedule builder: picks active `confirm` recurring rules whose next
 * occurrence is in the future and schedules a 09:00 reminder the day before
 * (or the morning of, when the occurrence is tomorrow and "yesterday" is today).
 */
export const buildReminderSchedule = (recurring = [], { formatTitle, formatBody, todayKey = todayDateKey() } = {}) => {
  const items = [];
  for (const rule of recurring) {
    if (!rule || rule.paused || rule.mode !== "confirm" || !rule.anchorDateKey) continue;
    const next = nextOccurrence(rule);
    if (!next?.dateKey || next.dateKey <= todayKey) continue;

    const dueDate = dateKeyToDate(next.dateKey);
    const dayBefore = subDays(dueDate, 1);
    const target = dayBefore > dateKeyToDate(todayKey) ? dayBefore : dueDate;
    const isDayBefore = target.getTime() === dayBefore.getTime();

    items.push({
      id: `${rule.id}-${next.dateKey}`,
      title: formatTitle ? formatTitle(rule, isDayBefore) : rule.description,
      body: formatBody ? formatBody(rule, minorToMajor(rule.amountMinor), isDayBefore) : rule.description,
      year: target.getFullYear(),
      month: target.getMonth() + 1,
      day: target.getDate(),
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    });
  }
  return items.sort((a, b) => (
    a.year - b.year || a.month - b.month || a.day - b.day
  ));
};

export const getReminderPermission = async () => {
  const plugin = getPlugin();
  if (!plugin) return "denied";
  try {
    const result = await plugin.getNotificationPermission();
    return result?.status || "prompt";
  } catch {
    return "denied";
  }
};

export const requestReminderPermission = async () => {
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const result = await plugin.requestNotificationPermission();
    return Boolean(result?.granted);
  } catch {
    return false;
  }
};

export const syncRecurringReminders = async (recurring, formatters) => {
  const plugin = getPlugin();
  if (!plugin) return 0;
  try {
    if (!isRecurringRemindersEnabled()) {
      await plugin.clearRecurringReminders();
      return 0;
    }
    const reminders = buildReminderSchedule(recurring, formatters);
    const result = await plugin.syncRecurringReminders({ reminders });
    return Number(result?.scheduled || 0);
  } catch {
    return 0;
  }
};

export const clearRecurringReminders = async () => {
  setRecurringRemindersEnabled(false);
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.clearRecurringReminders();
  } catch {
    // Ignore cleanup errors.
  }
};

const ALLOWED_REMINDER_PATHS = new Set(["/recurring", "/dashboard"]);

const isAllowedNativeRoute = (route) => {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) return false;
  const pathname = route.split("?", 1)[0];
  return ALLOWED_REMINDER_PATHS.has(pathname);
};

const defaultNavigate = (route) => {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === route) return;
  window.history.pushState({}, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Listens for iOS notification taps & Home Screen Quick Actions (and consumes
 * any route captured during a cold launch) to open the target route smoothly.
 */
export const installReminderTapHandler = async (onNavigate = defaultNavigate) => {
  const plugin = getPlugin();
  if (!plugin) return () => {};

  const routeIfAllowed = (route) => {
    if (isAllowedNativeRoute(route)) {
      onNavigate(route);
    }
  };

  let handle = null;
  try {
    if (typeof plugin.addListener === "function") {
      handle = await plugin.addListener("reminderTapped", (payload) => routeIfAllowed(payload?.route));
    }
    if (typeof plugin.consumePendingRoute === "function") {
      const pending = await plugin.consumePendingRoute();
      routeIfAllowed(pending?.route);
    }
  } catch {
    // Ignore missing plugin methods on older native shells.
  }

  return () => {
    handle?.remove?.();
  };
};

/** Test helper: resets the cached Capacitor plugin proxy. */
export const resetRemindersForTests = () => {
  cachedPlugin = null;
};
