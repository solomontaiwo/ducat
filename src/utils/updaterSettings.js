import { readLocalValue, writeLocalValue } from "./storage";

const KEY = "soldi-sotto-updater-settings";
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_UPDATER_SETTINGS = {
  autoCheck: true,
  frequency: "launch", // launch | daily | weekly
  lastCheckedAt: null,
};

export const readUpdaterSettings = () => {
  try {
    const raw = readLocalValue(KEY, null);
    if (!raw) return { ...DEFAULT_UPDATER_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_UPDATER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_UPDATER_SETTINGS };
  }
};

export const writeUpdaterSettings = (settings) =>
  writeLocalValue(KEY, JSON.stringify({ ...DEFAULT_UPDATER_SETTINGS, ...settings }));

/** Whether an automatic check is due right now, based on the saved frequency. */
export const isAutoCheckDue = (settings, now = Date.now()) => {
  if (!settings.autoCheck) return false;
  if (settings.frequency === "launch") return true;
  if (!settings.lastCheckedAt) return true;
  const elapsed = now - settings.lastCheckedAt;
  if (settings.frequency === "daily") return elapsed >= DAY_MS;
  if (settings.frequency === "weekly") return elapsed >= 7 * DAY_MS;
  return true;
};

/** Records that a check just happened, so the next one waits for the interval. */
export const markChecked = () => {
  const settings = readUpdaterSettings();
  writeUpdaterSettings({ ...settings, lastCheckedAt: Date.now() });
};
