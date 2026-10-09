import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  reauth: vi.fn(),
  credential: vi.fn((email, password) => ({ email, password })),
  sendReset: vi.fn(),
  verifyBeforeUpdate: vi.fn(),
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(() => "functions"),
  appCheck: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: mocks.credential },
  reauthenticateWithCredential: mocks.reauth,
  sendPasswordResetEmail: mocks.sendReset,
  verifyBeforeUpdateEmail: mocks.verifyBeforeUpdate,
}));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, httpsCallable: mocks.httpsCallable }));
vi.mock("../src/utils/firebaseAuth", () => ({ auth: mocks.auth }));
vi.mock("../src/utils/firebaseApp", () => ({ firebaseApp: "app" }));
vi.mock("../src/utils/firebaseAppCheck", () => ({ ensureFirebaseAppCheck: mocks.appCheck }));

import {
  deleteCurrentAccount,
  reauthenticateWithPassword,
  requestEmailChange,
  requestPasswordReset,
} from "../src/services/accountService.js";

const signedIn = () => {
  mocks.auth.currentUser = { email: "ada@example.com", getIdToken: vi.fn().mockResolvedValue("token") };
  return mocks.auth.currentUser;
};

describe("accountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.currentUser = null;
    mocks.httpsCallable.mockReturnValue(mocks.callable);
  });

  it("refuses sensitive operations without a signed-in user", async () => {
    await expect(reauthenticateWithPassword("pw")).rejects.toThrow("auth/no-current-user");
    await expect(requestPasswordReset()).rejects.toThrow("auth/no-current-user");
  });

  it("re-authenticates with the current email and the supplied password", async () => {
    const user = signedIn();
    await reauthenticateWithPassword("pw");
    expect(mocks.credential).toHaveBeenCalledWith("ada@example.com", "pw");
    expect(mocks.reauth).toHaveBeenCalledWith(user, { email: "ada@example.com", password: "pw" });
  });

  it("re-authenticates before changing the email and normalizes the new address", async () => {
    const user = signedIn();
    await requestEmailChange("  New@Example.COM ", "pw");
    expect(mocks.reauth).toHaveBeenCalled();
    expect(mocks.verifyBeforeUpdate).toHaveBeenCalledWith(user, "new@example.com");
    expect(mocks.reauth.mock.invocationCallOrder[0]).toBeLessThan(mocks.verifyBeforeUpdate.mock.invocationCallOrder[0]);
  });

  it("does not change the email when re-authentication fails", async () => {
    signedIn();
    mocks.reauth.mockRejectedValueOnce(new Error("auth/wrong-password"));
    await expect(requestEmailChange("new@example.com", "bad")).rejects.toThrow("auth/wrong-password");
    expect(mocks.verifyBeforeUpdate).not.toHaveBeenCalled();
  });

  it("sends a password reset to the current address", async () => {
    signedIn();
    await requestPasswordReset();
    expect(mocks.sendReset).toHaveBeenCalledWith(mocks.auth, "ada@example.com");
  });

  it("deletes the account through the callable after re-auth, a fresh token and App Check", async () => {
    const user = signedIn();
    mocks.appCheck.mockResolvedValue({});
    mocks.callable.mockResolvedValue({ data: {} });
    await deleteCurrentAccount("pw");
    expect(mocks.reauth).toHaveBeenCalled();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.getFunctions).toHaveBeenCalledWith("app", "europe-west1");
    expect(mocks.httpsCallable).toHaveBeenCalledWith("functions", "deleteAccount");
    expect(mocks.callable).toHaveBeenCalledTimes(1);
  });

  it("refuses to delete when App Check is not configured, without calling the backend", async () => {
    signedIn();
    mocks.appCheck.mockResolvedValue(null);
    await expect(deleteCurrentAccount("pw")).rejects.toThrow("app-check/not-configured");
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
