import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, collection, id) => ({ path: `${collection}/${id}` })),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  serverTimestamp: () => "TS",
}));
vi.mock("../src/utils/firebaseFirestore", () => ({ firestore: {} }));

import { ensureUserProfile } from "../src/services/profileService.js";

describe("ensureUserProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing without a user", async () => {
    expect(await ensureUserProfile(null)).toBeNull();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it("creates a missing profile from the display name", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    const profile = await ensureUserProfile({ uid: "u1", email: "ada@example.com", displayName: "Ada Lovelace" });
    expect(mocks.setDoc).toHaveBeenCalledWith({ path: "users/u1" }, expect.objectContaining({ username: "Ada Lovelace", displayName: "Ada Lovelace", email: "ada@example.com" }));
    expect(profile.displayName).toBe("Ada Lovelace");
  });

  it("falls back to the email local part, then to a UID-based name", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    expect((await ensureUserProfile({ uid: "u1", email: "grace@example.com" })).username).toBe("grace");
    expect((await ensureUserProfile({ uid: "abcdefghij", email: "x@example.com" })).username).toBe("user-abcdefgh");
  });

  it("returns an up-to-date existing profile untouched", async () => {
    const existing = { username: "Ada", email: "ada@example.com" };
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => existing });
    expect(await ensureUserProfile({ uid: "u1", email: "ada@example.com" })).toBe(existing);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("merges a changed email into the existing profile", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ username: "Ada", email: "old@example.com" }) });
    const profile = await ensureUserProfile({ uid: "u1", email: "new@example.com" });
    expect(mocks.setDoc).toHaveBeenCalledWith({ path: "users/u1" }, { email: "new@example.com", updatedAt: "TS" }, { merge: true });
    expect(profile.email).toBe("new@example.com");
  });
});
