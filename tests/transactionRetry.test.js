import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import { TransactionService } from "../src/services/transactionService.jsx";

const input = { amount: "12.50", description: "Caffè", date: new Date("2026-09-06T10:00:00Z"), category: "altro", type: "expense" };
const duplicate = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };

describe("TransactionService.add retries", () => {
  beforeEach(() => supabase.reset());

  it("uses a deterministic id per request and stores amounts in cents", async () => {
    const result = await TransactionService.add("owner", input, { requestId: "req-1" });
    expect(result.id).toBe("owner_req-1");
    const insert = supabase.calls.find((call) => call.action === "insert");
    expect(insert.payload).toMatchObject({
      id: "owner_req-1", user_id: "owner", amount_minor: 1250, currency: "EUR", type: "expense", date_key: "2026-09-06", schema_version: 2,
    });
  });

  it("treats a duplicate retry as success when the row is already visible to the owner", async () => {
    supabase.respond = (call) => (call.action === "insert" ? duplicate : { data: { id: "owner_req-1" }, error: null });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).resolves.toEqual({ id: "owner_req-1" });
  });

  it("does not mask a duplicate id that the owner cannot see", async () => {
    supabase.respond = (call) => (call.action === "insert" ? duplicate : { data: null, error: null });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).rejects.toMatchObject({ code: "already-exists" });
  });

  it("maps row level security failures to permission-denied without a lookup", async () => {
    supabase.respond = () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).rejects.toMatchObject({ code: "permission-denied" });
    expect(supabase.calls.filter((call) => call.action === "select")).toHaveLength(0);
  });

  it("rejects invalid input before reaching the database", async () => {
    await expect(TransactionService.add("owner", { ...input, amount: "-3" })).rejects.toBeDefined();
    expect(supabase.calls).toHaveLength(0);
  });
});
