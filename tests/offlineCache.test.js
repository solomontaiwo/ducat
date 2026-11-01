import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import { TransactionService as service } from "../src/services/transactionService.jsx";
import {
  clearOffline,
  readOffline,
  readOfflineAge,
  writeOffline,
} from "../src/utils/offlineCache.js";
import { transactionRow } from "./helpers/fakeSupabase.js";

const recentCache = (userId, limit = 50) => readOffline(`transactions-recent:${userId}:${limit}`);

beforeEach(() => {
  localStorage.clear();
  supabase.reset();
  service.invalidateCache();
});

afterEach(() => {
  clearOffline();
  vi.restoreAllMocks();
});

describe("offline cache", () => {
  it("round-trips a value with its timestamp", () => {
    const now = 1_700_000_000_000;
    expect(writeOffline("budgets:u1", { food: 300 }, now)).toBe(true);
    expect(readOffline("budgets:u1", { now })).toEqual({ food: 300 });
    expect(readOfflineAge("budgets:u1")).toBe(now);
    expect(readOfflineAge("missing")).toBeNull();
  });

  it("expires old entries and rejects a different version", () => {
    const now = 1_700_000_000_000;
    writeOffline("budgets:u1", { food: 300 }, now);
    expect(readOffline("budgets:u1", { now: now + 1000 })).toEqual({ food: 300 });
    expect(readOffline("budgets:u1", { now: now + 1000, maxAgeMs: 500 })).toBeNull();

    localStorage.setItem("ducat-cache:budgets:u1", JSON.stringify({ v: 99, at: now, value: { food: 1 } }));
    expect(readOffline("budgets:u1", { now })).toBeNull();
  });

  it("survives corrupted entries and a full quota", () => {
    localStorage.setItem("ducat-cache:budgets:u1", "{broken");
    expect(readOffline("budgets:u1")).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(writeOffline("budgets:u1", { food: 1 })).toBe(false);
  });
});

describe("recent transactions offline fallback", () => {
  it("serves the cached list when the request fails", async () => {
    writeOffline("transactions-recent:owner:50", [transactionRow("cached")]);
    supabase.respond = () => ({ data: null, error: { message: "Failed to fetch", code: "" } });

    const onUpdate = vi.fn();
    const onError = vi.fn();
    const stop = service.subscribeToRecent("owner", 50, onUpdate, onError);

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].map((item) => item.id)).toEqual(["cached"]);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it("refreshes the cache after a successful read", async () => {
    supabase.respond = () => ({ data: [transactionRow("fresh")], error: null });

    const onUpdate = vi.fn();
    const stop = service.subscribeToRecent("owner", 50, onUpdate);

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(recentCache("owner").map((row) => row.id)).toEqual(["fresh"]);
    stop();
  });

  it("still reports the error when there is no cached copy", async () => {
    supabase.respond = () => ({ data: null, error: { message: "Failed to fetch", code: "" } });

    const onUpdate = vi.fn();
    const onError = vi.fn();
    const stop = service.subscribeToRecent("nobody", 50, onUpdate, onError);

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
    stop();
  });
});
