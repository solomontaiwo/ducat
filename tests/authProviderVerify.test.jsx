import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../src/utils/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
    },
  },
}));
vi.mock("../src/utils/downloadUtils.jsx", () => ({ getCurrentProfileName: vi.fn(async () => "Ada") }));
vi.mock("../src/services/profileService.js", () => ({ ensureUserProfile: vi.fn(async () => {}) }));

import { AuthProvider, useAuth } from "../src/context/AuthProvider.jsx";

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.onAuthStateChange.mockImplementation((cb) => {
    cb("INITIAL_SESSION", null);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => {
  localStorage.clear();
});

describe("AuthProvider pending email verification", () => {
  it("signs in automatically with in-memory credentials once the email is confirmed", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "ada@example.com",
          email_confirmed_at: "2026-11-27T15:00:00Z",
          user_metadata: { display_name: "Ada", lang: "it" },
          created_at: "2026-11-27T14:55:00Z",
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.markPendingVerification("Ada@Example.com", "secret-123"));

    let refreshed;
    await act(async () => {
      refreshed = await result.current.refreshCurrentUser();
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "secret-123" });
    expect(refreshed?.emailVerified).toBe(true);
    expect(result.current.currentUser?.emailVerified).toBe(true);
    expect(localStorage.getItem("ducat-pending-verification")).toBeNull();
  });

  it("reports still unverified when Supabase returns email_not_confirmed", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.markPendingVerification("ada@example.com", "secret-123"));

    let refreshed;
    await act(async () => {
      refreshed = await result.current.refreshCurrentUser();
    });
    expect(refreshed.emailVerified).toBe(false);
    expect(refreshed.needsSignIn).toBeUndefined();
  });

  it("signals needsSignIn instead of false unverified when no session or in-memory password exists", async () => {
    localStorage.setItem("ducat-pending-verification", "ada@example.com");

    const { result } = renderHook(() => useAuth(), { wrapper });

    let refreshed;
    await act(async () => {
      refreshed = await result.current.refreshCurrentUser();
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(refreshed.emailVerified).toBe(false);
    expect(refreshed.needsSignIn).toBe(true);
  });
});
