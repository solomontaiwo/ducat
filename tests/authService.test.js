import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/supabaseClient.js", async (importOriginal) => {
  const { createFakeSupabase } = await import("./helpers/fakeSupabase.js");
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});

import { supabase } from "../src/utils/supabaseClient.js";
import {
  appUrl, onAuthChange, reloadUser, resendVerificationEmail, signIn, signUp, toAppUser, toAuthError, updateLanguage,
} from "../src/services/authService.js";

const supabaseUser = (overrides = {}) => ({
  id: "u1",
  email: "ada@example.com",
  email_confirmed_at: "2026-01-02T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: { display_name: "Ada" },
  identities: [{ id: "i1" }],
  ...overrides,
});

describe("authService", () => {
  beforeEach(() => { vi.clearAllMocks(); supabase.reset(); });
  afterEach(() => vi.unstubAllEnvs());

  it("exposes the account in the shape the app uses", () => {
    expect(toAppUser(supabaseUser())).toEqual({
      uid: "u1", email: "ada@example.com", emailVerified: true, displayName: "Ada", language: null, metadata: { creationTime: "2026-01-01T00:00:00Z" },
    });
    expect(toAppUser(supabaseUser({ email_confirmed_at: null })).emailVerified).toBe(false);
    expect(toAppUser(supabaseUser({ user_metadata: { member_since: "2024-05-01T00:00:00Z" } })).metadata.creationTime).toBe("2024-05-01T00:00:00Z");
    expect(toAppUser(null)).toBeNull();
  });

  it.each([
    [{ code: "invalid_credentials" }, "auth/invalid-credential"],
    [{ code: "email_not_confirmed" }, "auth/email-not-verified"],
    [{ code: "user_already_exists" }, "auth/email-already-in-use"],
    [{ code: "weak_password" }, "auth/weak-password"],
    [{ code: "over_email_send_rate_limit" }, "auth/too-many-requests"],
    [{ status: 429 }, "auth/too-many-requests"],
    [{ code: "something_new" }, "auth/something_new"],
  ])("maps %o to %s", (error, code) => {
    expect(toAuthError(error).code).toBe(code);
  });

  it("builds links inside the app base path", () => {
    expect(appUrl("reset-password")).toBe(new URL("reset-password", new URL(import.meta.env.BASE_URL, window.location.origin)).href);
  });

  it("uses the public web app for desktop authentication links", () => {
    vi.stubEnv("MODE", "desktop");
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "https://example.com/staging/");
    expect(appUrl("reset-password")).toBe("https://example.com/staging/reset-password");
    expect(appUrl("dashboard")).toBe("https://example.com/staging/dashboard");
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "http://example.com/");
    expect(() => appUrl("profile")).toThrow();
  });

  it("normalizes the email on sign in", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: supabaseUser(), session: {} }, error: null });
    expect((await signIn(" Ada@Example.com ", "pw")).uid).toBe("u1");
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "pw" });
  });

  it("signs up with the display name and the confirmation link", async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: supabaseUser({ email_confirmed_at: null }), session: null }, error: null });
    const result = await signUp({ email: "ada@example.com", password: "long-enough", displayName: "Ada", language: "en-GB" });
    expect(result.hasSession).toBe(false);
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "long-enough",
      options: { data: { display_name: "Ada", lang: "en" }, emailRedirectTo: expect.stringMatching(/\/dashboard$/) },
    });
  });

  it("reports an address that is already registered", async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: supabaseUser({ identities: [] }), session: null }, error: null });
    await expect(signUp({ email: "ada@example.com", password: "x", displayName: "Ada" })).rejects.toMatchObject({ code: "auth/email-already-in-use" });
  });

  it("resends the confirmation email", async () => {
    await resendVerificationEmail("Ada@Example.com");
    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup", email: "ada@example.com", options: { emailRedirectTo: expect.stringMatching(/\/dashboard$/) },
    });
  });

  it("reloads the user only when there is a session", async () => {
    expect(await reloadUser()).toBeNull();
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: supabaseUser({ email_confirmed_at: null }) } }, error: null });
    supabase.auth.getUser.mockResolvedValue({ data: { user: supabaseUser() }, error: null });
    expect((await reloadUser()).emailVerified).toBe(true);
  });

  it("stores the email language, Italian unless English", async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: { user: supabaseUser({ user_metadata: { lang: "en" } }) }, error: null });
    expect((await updateLanguage("en-US")).language).toBe("en");
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { lang: "en" } });
    await updateLanguage("fr");
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({ data: { lang: "it" } });
  });

  it("forwards auth changes as app users and can unsubscribe", () => {
    const unsubscribe = vi.fn();
    let listener;
    supabase.auth.onAuthStateChange.mockImplementation((callback) => { listener = callback; return { data: { subscription: { unsubscribe } } }; });
    const callback = vi.fn();
    const stop = onAuthChange(callback);
    listener("SIGNED_IN", { user: supabaseUser() });
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1" }), "SIGNED_IN");
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
