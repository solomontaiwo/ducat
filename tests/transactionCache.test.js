import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/firebaseFirestore.js", () => ({ firestore: {} }));
vi.mock("firebase/firestore", async (original) => ({
  ...await original(),
  collection: vi.fn(), query: vi.fn(),
  getDocs: vi.fn(), getCountFromServer: vi.fn(), onSnapshot: vi.fn(),
}));

import { getDocs, getCountFromServer, onSnapshot } from "firebase/firestore";
import { TransactionService as service, compareTransactions } from "../src/services/transactionService.jsx";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const snapshot = (id) => ({
  docs: [{ id, data: () => ({ amountMinor: 100, dateKey: "2026-09-06" }) }],
  docChanges: () => [],
});

describe("transaction cache freshness", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); service.invalidateCache(); });

  it("orders transactions with the same civil date by a stable secondary key", () => {
    const sameDay = (id) => ({ id, date: new Date("2026-09-06T00:00:00Z") });
    expect([sameDay("b"), sameDay("a")].sort(compareTransactions).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("awaits fresh data after TTL instead of returning the expired result", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    getDocs.mockResolvedValueOnce(snapshot("old"));
    await service.fetchAll("owner");
    clock.mockReturnValue(1000 + service.DEFAULT_TTL_MS);
    const pending = deferred();
    getDocs.mockReturnValueOnce(pending.promise);
    let settled = false;
    const request = service.fetchAll("owner").then((data) => { settled = true; return data; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve(snapshot("fresh"));
    expect((await request)[0].id).toBe("fresh");
  });

  it("reports refresh failures instead of silently serving expired data", async () => {
    getDocs.mockResolvedValueOnce(snapshot("old"));
    await service.fetchAll("owner");
    getDocs.mockRejectedValueOnce(new Error("offline"));
    await expect(service.fetchAll("owner", { ttlMs: 0 })).rejects.toThrow("offline");
  });

  it("invalidates ranges and counts before notifying realtime consumers", async () => {
    getDocs.mockResolvedValue(snapshot("old"));
    getCountFromServer.mockResolvedValue({ data: () => ({ count: 1 }) });
    await service.fetchAll("owner");
    await service.getTotalCount("owner");
    let callback;
    onSnapshot.mockImplementation((query, listener) => { callback = listener; return () => {}; });
    const update = vi.fn(() => Promise.all([service.fetchAll("owner"), service.getTotalCount("owner")]));
    service.subscribeToRecent("owner", 50, update);
    getDocs.mockResolvedValue(snapshot("new"));
    getCountFromServer.mockResolvedValue({ data: () => ({ count: 2 }) });
    callback(snapshot("new"));
    const [data, count] = await update.mock.results[0].value;
    expect(data[0].id).toBe("new");
    expect(count).toBe(2);
  });

  it.each(["range", "count"])("does not let invalidated %s requests overwrite or evict newer requests", async (kind) => {
    const old = deferred(), fresh = deferred();
    const loader = kind === "range" ? getDocs : getCountFromServer;
    const fetch = () => kind === "range" ? service.fetchAll("owner") : service.getTotalCount("owner");
    const value = (id) => kind === "range" ? snapshot(id) : { data: () => ({ count: id }) };
    loader.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = fetch();
    service.invalidateCache();
    const second = fetch();
    old.resolve(value(1));
    await Promise.resolve();
    const third = fetch();
    fresh.resolve(value(2));
    const results = await Promise.all([first, second, third]);
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(await fetch()).toEqual(results[1]);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
