import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import { PlanningService } from "../src/services/planningService.js";
import { DEFAULT_PREFERENCES } from "../src/schemas/planning.js";
import { clearOffline } from "../src/utils/offlineCache.js";

const ruleRow = {
  id: "r1", user_id: "u1", type: "expense", amount_minor: 89000, currency: "EUR", description: "Affitto", category: "casa",
  frequency: "monthly", anchor_date_key: "2026-01-05", next_index: 3, mode: "auto", paused: false,
};
const rule = {
  type: "expense", amountMinor: 89000, currency: "EUR", description: "Affitto", category: "casa",
  frequency: "monthly", anchorDateKey: "2026-01-05", nextIndex: 1, mode: "auto", paused: false,
};

describe("PlanningService", () => {
  beforeEach(() => { vi.clearAllMocks(); supabase.reset(); clearOffline(); });

  it("streams recurring rules in the app's shape and refreshes after a local write", async () => {
    supabase.respond = (call) => (call.action === "select" && call.table === "recurring" && !call.returning
      ? { data: [ruleRow] }
      : { data: { id: "new-id" } });
    const onData = vi.fn();
    const stop = PlanningService.subscribeRecurring("u1", onData);
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(onData.mock.calls[0][0]).toEqual([expect.objectContaining({ id: "r1", amountMinor: 89000, anchorDateKey: "2026-01-05", nextIndex: 3 })]);

    expect(await PlanningService.addRecurring("u1", rule)).toBe("new-id");
    const insert = supabase.calls.find((call) => call.action === "insert");
    expect(insert.payload).toEqual({
      type: "expense", amount_minor: 89000, currency: "EUR", description: "Affitto", category: "casa",
      frequency: "monthly", anchor_date_key: "2026-01-05", next_index: 1, mode: "auto", paused: false, user_id: "u1",
    });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    stop();
    expect(supabase.channels[0].on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "recurring", filter: "user_id=eq.u1" },
      expect.any(Function)
    );
  });

  it("updates only the allowed fields of a rule", async () => {
    await PlanningService.updateRecurring("r1", { nextIndex: 4, paused: true });
    expect(supabase.calls[0]).toMatchObject({ table: "recurring", action: "update", payload: { next_index: 4, paused: true } });
    expect(supabase.calls[0].filters).toContainEqual(["eq", "id", "r1"]);
    await expect(PlanningService.updateRecurring("r1", { nextIndex: -1 })).rejects.toBeDefined();
  });

  it("reads budgets and preferences, with empty defaults", async () => {
    supabase.respond = (call) => (call.table === "budgets" ? { data: { limits: { casa: 1000 } } } : { data: null });
    const budgets = vi.fn();
    const preferences = vi.fn();
    const stopBudgets = PlanningService.subscribeBudgets("u1", budgets);
    const stopPreferences = PlanningService.subscribePreferences("u1", preferences);
    await vi.waitFor(() => expect(budgets).toHaveBeenCalledWith({ casa: 1000 }));
    await vi.waitFor(() => expect(preferences).toHaveBeenCalledWith(null));
    stopBudgets();
    stopPreferences();
  });

  it("upserts budgets and validated preferences, one row per user", async () => {
    await PlanningService.saveBudgets("u1", { casa: 1000 });
    await PlanningService.savePreferences("u1", { ...DEFAULT_PREFERENCES, monthStartDay: 27 });
    expect(supabase.calls[0]).toMatchObject({ table: "budgets", action: "upsert", payload: { user_id: "u1", limits: { casa: 1000 } }, options: { onConflict: "user_id" } });
    expect(supabase.calls[1]).toMatchObject({ rpc: "save_preferences_patch", args: { p_patch: expect.objectContaining({ monthStartDay: 27 }) } });
    await expect(PlanningService.savePreferences("u1", { ...DEFAULT_PREFERENCES, monthStartDay: 40 })).rejects.toBeDefined();
  });

  it("reports load errors to the subscriber", async () => {
    supabase.respond = () => ({ data: null, error: { code: "42501", message: "denied" } });
    const onError = vi.fn();
    const stop = PlanningService.subscribeBudgets("u1", vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "permission-denied" })));
    stop();
  });
});

it('ignores a slow obsolete response after a more recent reload', async () => {
  vi.clearAllMocks(); supabase.reset();
  let resolveOld;
  supabase.respond = () => new Promise(done => { resolveOld = done; });
  const onData = vi.fn();
  const stop = PlanningService.subscribeBudgets('u1', onData);
  await vi.waitFor(() => expect(resolveOld).toBeDefined());
  supabase.respond = () => ({ data: { limits: { casa: 3000 } } });
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(onData).toHaveBeenCalledWith({ casa: 3000 }));
  resolveOld({ data: { limits: { casa: 1000 } } });
  await new Promise(done => setTimeout(done, 0));
  expect(onData).toHaveBeenCalledOnce();
  stop();
});

it('reloads after a remote deletion without a user filter and on reconnect', async () => {
  vi.clearAllMocks(); supabase.reset();
  supabase.respond = () => ({ data: { limits: { casa: 1000 } } });
  const onData = vi.fn(), stop = PlanningService.subscribeBudgets('u1', onData);
  await vi.waitFor(() => expect(onData).toHaveBeenCalledOnce());
  expect(supabase.channels[0].on).toHaveBeenCalledWith('postgres_changes', { event: 'DELETE', schema: 'public', table: 'budgets' }, expect.any(Function));
  supabase.respond = () => ({ data: null });
  supabase.channels[0].handlers[1]();
  window.dispatchEvent(new Event('focus'));
  await vi.waitFor(() => expect(onData).toHaveBeenLastCalledWith({}));
  expect(onData).toHaveBeenCalledTimes(2);
  supabase.channels[0].subscribe.mock.calls[0][0]('SUBSCRIBED');
  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(3));
  stop();
  window.dispatchEvent(new Event('online'));
  await new Promise(done => setTimeout(done, 80));
  expect(onData).toHaveBeenCalledTimes(3);
});
