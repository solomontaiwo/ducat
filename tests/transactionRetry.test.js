import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/firebaseFirestore.js", () => ({ firestore: {} }));
vi.mock("firebase/firestore", async (original) => ({
  ...await original(),
  doc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
}));

import { getDoc, setDoc } from "firebase/firestore";
import { TransactionService } from "../src/services/transactionService.jsx";

const input = { amount: "12.50", description: "Caffè", date: new Date("2026-09-06T10:00:00Z"), category: "altro", type: "expense" };
const denied = () => Object.assign(new Error("denied"), { code: "permission-denied" });

describe("TransactionService.add retries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a deterministic document ID per request", async () => {
    setDoc.mockResolvedValue();
    const reference = await TransactionService.add("owner", input, { requestId: "req-1" });
    expect(reference.path).toBe("transactions/owner_req-1");
  });

  it("treats a rejected retry as success when the document already exists for the owner", async () => {
    setDoc.mockRejectedValueOnce(denied());
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ userId: "owner" }) });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).resolves.toBeDefined();
  });

  it("still fails when the write is denied and nothing was saved", async () => {
    setDoc.mockRejectedValueOnce(denied());
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("does not mask a document that belongs to somebody else", async () => {
    setDoc.mockRejectedValueOnce(denied());
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ userId: "other" }) });
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("does not look up the document for unrelated errors", async () => {
    setDoc.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(TransactionService.add("owner", input, { requestId: "req-1" })).rejects.toThrow("offline");
    expect(getDoc).not.toHaveBeenCalled();
  });
});
