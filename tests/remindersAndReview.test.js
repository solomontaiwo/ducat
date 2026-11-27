import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeMock = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(async () => ({ status: "granted" })),
  requestNotificationPermission: vi.fn(async () => ({ granted: true })),
  syncRecurringReminders: vi.fn(async ({ reminders }) => ({ scheduled: reminders.length })),
  clearRecurringReminders: vi.fn(async () => ({ cleared: true })),
  consumePendingRoute: vi.fn(async () => ({ route: null })),
  addListener: vi.fn(async (_event, callback) => {
    nativeMock._listener = callback;
    return { remove: vi.fn() };
  }),
  _listener: null,
  requestAppReview: vi.fn(async () => ({ requested: true })),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => nativeMock),
}));

import {
  buildReminderSchedule,
  clearRecurringReminders,
  installReminderTapHandler,
  isRecurringRemindersEnabled,
  requestReminderPermission,
  resetRemindersForTests,
  setRecurringRemindersEnabled,
  syncRecurringReminders,
} from "../src/platform/reminders.js";
import {
  MIN_SAVES_BEFORE_PROMPT,
  recordPositiveSaveAndMaybeRequestReview,
  resetReviewState,
} from "../src/platform/appReview.js";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetRemindersForTests();
  resetReviewState();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("recurring reminders", () => {
  it("builds a chronological schedule for active confirm rules only", () => {
    const rules = [
      { id: "r-auto", description: "Netflix", amountMinor: 1599, mode: "auto", paused: false, frequency: "monthly", anchorDateKey: "2026-10-28", nextIndex: 1 },
      { id: "r-paused", description: "Palestra", amountMinor: 4000, mode: "confirm", paused: true, frequency: "monthly", anchorDateKey: "2026-10-28", nextIndex: 1 },
      { id: "r-past", description: "Vecchia", amountMinor: 1000, mode: "confirm", paused: false, frequency: "monthly", anchorDateKey: "2026-10-20", nextIndex: 1 },
      // Due 2026-11-26 (tomorrow relative to 2026-11-25) -> morning of 2026-11-26
      { id: "r-tomorrow", description: "Affitto", amountMinor: 80000, mode: "confirm", paused: false, frequency: "monthly", anchorDateKey: "2026-10-26", nextIndex: 1 },
      // Due 2026-11-30 -> day before 2026-11-29 at 09:00
      { id: "r-later", description: "Bolletta", amountMinor: 6550, mode: "confirm", paused: false, frequency: "monthly", anchorDateKey: "2026-10-30", nextIndex: 1 },
    ];

    const schedule = buildReminderSchedule(rules, {
      todayKey: "2026-11-25",
      formatTitle: (rule) => `In arrivo: ${rule.description}`,
      formatBody: (_rule, amount, isDayBefore) => `${isDayBefore ? "Domani" : "Oggi"} ${amount}`,
    });

    expect(schedule).toEqual([
      {
        id: "r-tomorrow-2026-11-26",
        title: "In arrivo: Affitto",
        body: "Oggi 800",
        year: 2026,
        month: 11,
        day: 26,
        hour: 9,
        minute: 0,
      },
      {
        id: "r-later-2026-11-30",
        title: "In arrivo: Bolletta",
        body: "Domani 65.5",
        year: 2026,
        month: 11,
        day: 29,
        hour: 9,
        minute: 0,
      },
    ]);
  });

  it("syncs and clears reminders through NativeFeatures on mobile and no-ops on web", async () => {
    vi.stubEnv("MODE", "production");
    expect(await requestReminderPermission()).toBe(false);
    expect(await syncRecurringReminders([])).toBe(0);
    expect(nativeMock.syncRecurringReminders).not.toHaveBeenCalled();

    vi.stubEnv("MODE", "mobile");
    expect(await requestReminderPermission()).toBe(true);

    setRecurringRemindersEnabled(true);
    expect(isRecurringRemindersEnabled()).toBe(true);
    const rules = [
      { id: "r1", description: "Affitto", amountMinor: 70000, mode: "confirm", paused: false, frequency: "monthly", anchorDateKey: "2026-10-30", nextIndex: 1 },
    ];
    const scheduled = await syncRecurringReminders(rules, { todayKey: "2026-11-25" });
    expect(scheduled).toBe(1);
    expect(nativeMock.syncRecurringReminders).toHaveBeenCalledTimes(1);

    await clearRecurringReminders();
    expect(isRecurringRemindersEnabled()).toBe(false);
    expect(nativeMock.clearRecurringReminders).toHaveBeenCalledTimes(1);
  });

  it("navigates to allowed routes on cold-start and live reminder taps, ignoring unsafe routes", async () => {
    vi.stubEnv("MODE", "mobile");
    nativeMock.consumePendingRoute.mockResolvedValueOnce({ route: "/recurring" });
    const onNavigate = vi.fn();
    const cleanup = await installReminderTapHandler(onNavigate);

    expect(onNavigate).toHaveBeenCalledWith("/recurring");
    nativeMock._listener?.({ route: "/dashboard" });
    expect(onNavigate).toHaveBeenCalledWith("/dashboard");
    nativeMock._listener?.({ route: "https://evil.example" });
    expect(onNavigate).toHaveBeenCalledTimes(2);
    cleanup();
  });
});

describe("in-app review prompt", () => {
  it("ignores web and demo saves, prompts once after MIN_SAVES_BEFORE_PROMPT real saves on mobile", async () => {
    vi.stubEnv("MODE", "production");
    expect(await recordPositiveSaveAndMaybeRequestReview({ isDemo: false })).toBe(false);
    expect(nativeMock.requestAppReview).not.toHaveBeenCalled();

    vi.stubEnv("MODE", "mobile");
    expect(await recordPositiveSaveAndMaybeRequestReview({ isDemo: true })).toBe(false);
    expect(nativeMock.requestAppReview).not.toHaveBeenCalled();

    for (let index = 1; index < MIN_SAVES_BEFORE_PROMPT; index += 1) {
      expect(await recordPositiveSaveAndMaybeRequestReview({ isDemo: false })).toBe(false);
    }
    expect(nativeMock.requestAppReview).not.toHaveBeenCalled();

    // Threshold reached: prompt once
    expect(await recordPositiveSaveAndMaybeRequestReview({ isDemo: false })).toBe(true);
    expect(nativeMock.requestAppReview).toHaveBeenCalledTimes(1);

    // Subsequent saves on the same version do not re-prompt
    expect(await recordPositiveSaveAndMaybeRequestReview({ isDemo: false })).toBe(false);
    expect(nativeMock.requestAppReview).toHaveBeenCalledTimes(1);
  });
});
