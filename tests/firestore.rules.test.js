import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

let environment;

const profile = (email, name = "Utente Test") => ({
  username: name,
  displayName: name,
  email,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const transactionV2 = (userId) => ({
  userId,
  amount: 12.34,
  amountMinor: 1234,
  currency: "EUR",
  description: "Test",
  date: new Date("2026-08-04T00:00:00.000Z"),
  dateKey: "2026-08-04",
  category: "altro",
  type: "expense",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  schemaVersion: 2,
});

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-soldi-sotto",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});

afterEach(() => environment.clearFirestore());
afterAll(() => environment.cleanup());

describe("Firestore rules", () => {
  it("allows a verified owner to create and read a v2 transaction", async () => {
    const db = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: true }).firestore();
    const reference = doc(db, "transactions", "tx-1");
    await assertSucceeds(setDoc(reference, transactionV2("owner")));
    await assertSucceeds(getDoc(reference));
  });

  it("denies unverified and non-owner access", async () => {
    const unverified = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: false }).firestore();
    await assertFails(setDoc(doc(unverified, "transactions", "tx-1"), transactionV2("owner")));

    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "transactions", "tx-2"), {
        ...transactionV2("owner"),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const attacker = environment.authenticatedContext("attacker", { email: "attacker@example.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(attacker, "transactions", "tx-2")));
  });

  it("denies invalid amount and immutable field changes", async () => {
    const db = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: true }).firestore();
    const reference = doc(db, "transactions", "tx-3");
    await assertFails(setDoc(reference, { ...transactionV2("owner"), amountMinor: 0 }));
    await assertSucceeds(setDoc(reference, transactionV2("owner")));
    await assertFails(updateDoc(reference, { userId: "attacker", updatedAt: serverTimestamp() }));
  });

  const legacyTransaction = (userId) => ({
    userId,
    amount: 10.5,
    description: "Legacy",
    date: new Date("2026-08-04T00:00:00.000Z"),
    category: "altro",
    type: "expense",
    createdAt: new Date("2026-08-04T00:00:00.000Z"),
  });
  const verifiedOwner = () => environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: true }).firestore();
  const seed = (id, data) => environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "transactions", id), data));

  it("denies extra fields on create", async () => {
    await assertFails(setDoc(doc(verifiedOwner(), "transactions", "extra"), { ...transactionV2("owner"), injected: true }));
  });

  it("denies creating new legacy-shaped transactions", async () => {
    await assertFails(setDoc(doc(verifiedOwner(), "transactions", "legacy-new"), { ...legacyTransaction("owner"), createdAt: serverTimestamp() }));
  });

  it("denies editing legacy-shaped documents and blocks downgrading v2 documents", async () => {
    await seed("legacy", legacyTransaction("owner"));
    await seed("modern", { ...transactionV2("owner"), createdAt: new Date("2026-08-04T00:00:00.000Z"), updatedAt: new Date("2026-08-04T00:00:00.000Z") });
    const db = verifiedOwner();
    await assertFails(setDoc(doc(db, "transactions", "legacy"), { ...legacyTransaction("owner"), description: "Edited" }));
    await assertFails(setDoc(doc(db, "transactions", "modern"), { ...legacyTransaction("owner"), createdAt: new Date("2026-08-04T00:00:00.000Z") }));
  });

  it("rejects a repeated write to an existing ID, which the client treats as already saved", async () => {
    const reference = doc(verifiedOwner(), "transactions", "owner_request-1");
    await assertSucceeds(setDoc(reference, transactionV2("owner")));
    await assertFails(setDoc(reference, transactionV2("owner")));
    await assertSucceeds(getDoc(reference));
  });

  it("allows only the verified owner to delete a transaction", async () => {
    await seed("to-delete", { ...transactionV2("owner"), createdAt: new Date(), updatedAt: new Date() });
    const attacker = environment.authenticatedContext("attacker", { email: "attacker@example.com", email_verified: true }).firestore();
    const unverified = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: false }).firestore();
    await assertFails(deleteDoc(doc(attacker, "transactions", "to-delete")));
    await assertFails(deleteDoc(doc(unverified, "transactions", "to-delete")));
    await assertSucceeds(deleteDoc(doc(verifiedOwner(), "transactions", "to-delete")));
  });

  it("allows only the account owner to delete the profile", async () => {
    await environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "users", "owner"), {
      ...profile("owner@example.com"), createdAt: new Date(), updatedAt: new Date(),
    }));
    const attacker = environment.authenticatedContext("attacker", { email: "attacker@example.com" }).firestore();
    await assertFails(deleteDoc(doc(attacker, "users", "owner")));
    await assertSucceeds(deleteDoc(doc(environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore(), "users", "owner")));
  });

  it("keeps the legacy usernames collection inaccessible", async () => {
    const db = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "usernames", "anyone")));
    await assertFails(setDoc(doc(db, "usernames", "anyone"), { uid: "owner" }));
  });

  it("requires owner-constrained collection queries", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "transactions", "owner-tx"), {
        ...transactionV2("owner"), createdAt: new Date(), updatedAt: new Date(),
      });
    });
    const db = environment.authenticatedContext("owner", { email: "owner@example.com", email_verified: true }).firestore();
    await assertFails(getDocs(collection(db, "transactions")));
    await assertSucceeds(getDocs(query(collection(db, "transactions"), where("userId", "==", "owner"))));
  });

  it("validates profile types, names and immutable email", async () => {
    const db = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
    const reference = doc(db, "users", "owner");
    await assertSucceeds(setDoc(reference, profile("owner@example.com")));
    await assertFails(updateDoc(reference, { email: "other@example.com", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(reference, {
      username: "x",
      displayName: "x",
      updatedAt: serverTimestamp(),
    }));
  });

  it("denies profile list, non-owner reads and extra fields", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "owner"), {
        ...profile("owner@example.com"), createdAt: new Date(), updatedAt: new Date(),
      });
    });
    const attacker = environment.authenticatedContext("attacker", { email: "attacker@example.com" }).firestore();
    await assertFails(getDoc(doc(attacker, "users", "owner")));
    await assertFails(getDocs(collection(attacker, "users")));

    const owner = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
    await assertFails(updateDoc(doc(owner, "users", "owner"), {
      role: "admin",
      updatedAt: serverTimestamp(),
    }));
  });
});
