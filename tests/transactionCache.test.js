import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import { TransactionService as service, compareTransactions } from "../src/services/transactionService.jsx";
import { emitLocalChange } from "../src/services/changeEvents.js";
import { transactionRow } from "./helpers/fakeSupabase.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const rows = (id) => ({ data: [transactionRow(id)], error: null });
const isCount = (call) => call.options?.head === true;

describe("transaction cache freshness", () => {
  beforeEach(() => { vi.restoreAllMocks(); supabase.reset(); service.invalidateCache(); });

  it("orders transactions with the same civil date by a stable secondary key", () => {
    const sameDay = (id) => ({ id, date: new Date("2026-09-06T00:00:00Z") });
    expect([sameDay("b"), sameDay("a")].sort(compareTransactions).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("maps rows to the shape the app uses", async () => {
    supabase.respond = () => rows("t1");
    const [item] = await service.fetchAll("owner");
    expect(item).toMatchObject({ id: "t1", amountMinor: 100, amount: 1, dateKey: "2026-09-06", type: "expense", currency: "EUR" });
    expect(item.date).toBeInstanceOf(Date);
  });

  it("drops invalid rows and reports them", async () => {
    supabase.respond = () => ({ data: [transactionRow("ok"), transactionRow("bad", { amount_minor: 0 })], error: null });
    const onInvalid = vi.fn();
    const data = await service.fetchAll("owner", { onInvalid });
    expect(data.map((item) => item.id)).toEqual(["ok"]);
    expect(onInvalid).toHaveBeenCalledWith(expect.objectContaining({ id: "bad" }));
  });

  it("reads long histories in batches of 1000 rows", async () => {
    const page = (start, size) => Array.from({ length: size }, (_, index) => transactionRow(`t${start + index}`));
    supabase.respond = (call) => {
      const [, from] = call.filters.find(([method]) => method === "range");
      return { data: from === 0 ? page(0, 1000) : page(1000, 5), error: null };
    };
    expect(await service.fetchAll("owner")).toHaveLength(1005);
  });

  it("filters ranges by owner, type and inclusive civil dates", async () => {
    supabase.respond = () => rows("t1");
    await service.fetchRange("owner", { type: "income", startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(supabase.calls[0].filters).toEqual(expect.arrayContaining([
      ["eq", "user_id", "owner"], ["eq", "type", "income"], ["gte", "date_key", "2026-09-01"], ["lte", "date_key", "2026-09-30"],
    ]));
  });

  it("awaits fresh data after TTL instead of returning the expired result", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    supabase.respond = () => rows("old");
    await service.fetchAll("owner");
    clock.mockReturnValue(1000 + service.DEFAULT_TTL_MS);
    const pending = deferred();
    supabase.respond = () => pending.promise;
    let settled = false;
    const request = service.fetchAll("owner").then((data) => { settled = true; return data; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve(rows("fresh"));
    expect((await request)[0].id).toBe("fresh");
  });

  it("reports refresh failures instead of silently serving expired data", async () => {
    supabase.respond = () => rows("old");
    await service.fetchAll("owner");
    supabase.respond = () => ({ data: null, error: { code: "PGRST000", message: "offline" } });
    await expect(service.fetchAll("owner", { ttlMs: 0 })).rejects.toThrow("offline");
  });

  it("pages with a keyset cursor", async () => {
    supabase.respond = () => ({ data: [transactionRow("b", { date_key: "2026-09-06" }), transactionRow("a", { date_key: "2026-09-05" })], error: null });
    const first = await service.fetchPage("owner", { pageSize: 2 });
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({ dateKey: "2026-09-05", id: "a" });
    await service.fetchPage("owner", { pageSize: 2, cursor: first.nextCursor });
    expect(supabase.calls[1].filters).toContainEqual(["or", "date_key.lt.2026-09-05,and(date_key.eq.2026-09-05,id.lt.a)"]);
  });

  it("gets totals and per-category counts from the database", async () => {
    supabase.respond = (call) => (call.rpc === "transaction_totals"
      ? { data: [{ count: 3, income_minor: 200000, expense_minor: 2000 }] }
      : { data: [{ category: "food", count: 2 }] });
    expect(await service.getTotals("owner", { startDate: "2026-09-01", endDate: "2026-09-30" }))
      .toEqual({ count: 3, incomeMinor: 200000, expenseMinor: 2000 });
    expect(supabase.calls[0].args).toEqual({ p_type: "all", p_start: "2026-09-01", p_end: "2026-09-30" });
    expect(await service.countByCategory("owner", ["food", "rent"])).toEqual({ food: 2, rent: 0 });
  });

  it("finds the oldest transaction date", async () => {
    supabase.respond = () => ({ data: [{ date_key: "2025-03-14" }] });
    const date = await service.getFirstDate("owner");
    expect(date.getFullYear()).toBe(2025);
    supabase.respond = () => ({ data: [] });
    expect(await service.getFirstDate("owner")).toBeNull();
  });

  it("refreshes subscribers after local writes and Realtime changes", async () => {
    supabase.respond = () => rows("first");
    const update = vi.fn();
    const stop = service.subscribeToRecent("owner", 50, update);
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0][0].id).toBe("first");

    supabase.respond = () => rows("local");
    emitLocalChange("transactions");
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0][0].id).toBe("local");

    supabase.respond = () => rows("remote");
    supabase.channels[0].handlers[0]({ eventType: "INSERT" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    expect(update.mock.calls[2][0][0].id).toBe("remote");

    stop();
    expect(supabase.removeChannel).toHaveBeenCalledWith(supabase.channels[0]);
  });

  it("invalidates ranges and counts before notifying subscribers", async () => {
    supabase.respond = (call) => (isCount(call) ? { count: 1 } : rows("old"));
    await service.fetchAll("owner");
    await service.getTotalCount("owner");
    supabase.respond = (call) => (isCount(call) ? { count: 2 } : rows("new"));
    const update = vi.fn(() => Promise.all([service.fetchAll("owner"), service.getTotalCount("owner")]));
    const stop = service.subscribeToRecent("owner", 50, update);
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    const [data, count] = await update.mock.results[0].value;
    expect(data[0].id).toBe("new");
    expect(count).toBe(2);
    stop();
  });

  it.each(["range", "count"])("does not let invalidated %s requests overwrite or evict newer requests", async (kind) => {
    const old = deferred(), fresh = deferred();
    const queue = [old.promise, fresh.promise];
    let loads = 0;
    supabase.respond = () => { loads += 1; return queue.shift(); };
    const fetch = () => kind === "range" ? service.fetchAll("owner") : service.getTotalCount("owner");
    const value = (id) => kind === "range" ? rows(`t${id}`) : { count: id };
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
    expect(loads).toBe(2);
  });

  it("confirms updates and deletes that touched a row, and fails otherwise", async () => {
    supabase.respond = () => ({ data: [{ id: "t1" }] });
    await expect(service.update("t1", { amount: "3" })).resolves.toBeUndefined();
    expect(supabase.calls[0].payload).toEqual({ amount_minor: 300, schema_version: 2 });
    await expect(service.delete("t1")).resolves.toBeUndefined();
    supabase.respond = () => ({ data: [] });
    await expect(service.delete("missing")).rejects.toMatchObject({ code: "permission-denied" });
  });
});
