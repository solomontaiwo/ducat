import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import { ensureUserProfile, getProfile, saveProfileName } from "../src/services/profileService.js";

const row = (overrides = {}) => ({ username: "Ada", display_name: "Ada", email: "ada@example.com", created_at: "c", updated_at: "u", ...overrides });
const writes = () => supabase.calls.filter((call) => call.action !== "select");

describe("profileService", () => {
  beforeEach(() => { vi.clearAllMocks(); supabase.reset(); });

  it("does nothing without a signed-in user", async () => {
    expect(await ensureUserProfile(null)).toBeNull();
    expect(await ensureUserProfile({ email: "pending@example.com", pending: true })).toBeNull();
    expect(supabase.calls).toHaveLength(0);
  });

  it("reads a profile in the app's shape", async () => {
    supabase.respond = () => ({ data: row() });
    expect(await getProfile("u1")).toEqual({ username: "Ada", displayName: "Ada", email: "ada@example.com", createdAt: "c", updatedAt: "u" });
  });

  it("creates a missing profile from the display name", async () => {
    supabase.respond = () => ({ data: null });
    const profile = await ensureUserProfile({ uid: "u1", email: "ada@example.com", displayName: "Ada Lovelace" });
    expect(writes()[0]).toMatchObject({
      action: "upsert",
      payload: { id: "u1", username: "Ada Lovelace", display_name: "Ada Lovelace", email: "ada@example.com" },
      options: { onConflict: "id", ignoreDuplicates: true },
    });
    expect(profile.displayName).toBe("Ada Lovelace");
  });

  it("falls back to the email local part, then to an id-based name", async () => {
    supabase.respond = () => ({ data: null });
    expect((await ensureUserProfile({ uid: "u1", email: "grace@example.com" })).username).toBe("grace");
    expect((await ensureUserProfile({ uid: "abcd-efgh-ij", email: "x@example.com" })).username).toBe("user-abcdefgh");
  });

  it("returns an up-to-date existing profile untouched", async () => {
    supabase.respond = () => ({ data: row() });
    expect((await ensureUserProfile({ uid: "u1", email: "ada@example.com" })).displayName).toBe("Ada");
    expect(writes()).toHaveLength(0);
  });

  it("stores a changed email on the existing profile", async () => {
    supabase.respond = () => ({ data: row({ email: "old@example.com" }) });
    const profile = await ensureUserProfile({ uid: "u1", email: "new@example.com" });
    expect(writes()[0]).toMatchObject({ action: "update", payload: { email: "new@example.com" } });
    expect(profile.email).toBe("new@example.com");
  });

  it("saves a new name on the profile and on the account", async () => {
    await saveProfileName({ uid: "u1", email: "ada@example.com" }, "  Ada L. ");
    expect(writes()[0]).toMatchObject({ action: "upsert", payload: { id: "u1", username: "Ada L.", display_name: "Ada L." } });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: "Ada L." } });
  });

  it("rejects names that are too short", async () => {
    await expect(saveProfileName({ uid: "u1" }, "A")).rejects.toBeDefined();
    expect(writes()).toHaveLength(0);
  });
});
