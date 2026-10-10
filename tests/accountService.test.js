import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import {
  deleteCurrentAccount,
  reauthenticateWithPassword,
  requestEmailChange,
  requestPasswordReset,
} from "../src/services/accountService.js";

const signedIn = () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1", email: "ada@example.com" } } }, error: null });
};
const signInOk = () => supabase.auth.signInWithPassword.mockResolvedValue({
  data: { user: { id: "u1", email: "ada@example.com", email_confirmed_at: "2026-01-01" }, session: {} }, error: null,
});

describe("accountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.reset();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInOk();
  });

  it("refuses sensitive operations without a signed-in user", async () => {
    await expect(reauthenticateWithPassword("pw")).rejects.toMatchObject({ code: "auth/no-current-user" });
    await expect(requestPasswordReset()).rejects.toMatchObject({ code: "auth/no-current-user" });
  });

  it("re-authenticates with the current email and the supplied password", async () => {
    signedIn();
    await reauthenticateWithPassword("pw");
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "pw" });
  });

  it("maps a wrong password to auth/invalid-credential", async () => {
    signedIn();
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } });
    await expect(reauthenticateWithPassword("bad")).rejects.toMatchObject({ code: "auth/invalid-credential" });
  });

  it("re-authenticates before changing the email and normalizes the new address", async () => {
    signedIn();
    await requestEmailChange("  New@Example.COM ", "pw");
    expect(supabase.auth.updateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: expect.stringMatching(/\/profile$/) }
    );
    expect(supabase.auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(supabase.auth.updateUser.mock.invocationCallOrder[0]);
  });

  it("does not change the email when re-authentication fails", async () => {
    signedIn();
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "bad" } });
    await expect(requestEmailChange("new@example.com", "bad")).rejects.toBeDefined();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("sends a password reset that comes back to the reset page", async () => {
    signedIn();
    await requestPasswordReset();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", { redirectTo: expect.stringMatching(/\/reset-password$/) });
  });

  it("deletes the account through the database after re-authentication, then signs out", async () => {
    signedIn();
    await deleteCurrentAccount("pw");
    expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("delete_my_account");
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the account when the password is wrong", async () => {
    signedIn();
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "bad" } });
    await expect(deleteCurrentAccount("bad")).rejects.toMatchObject({ code: "auth/invalid-credential" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
