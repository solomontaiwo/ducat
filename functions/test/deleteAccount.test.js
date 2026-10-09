import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECENT_AUTH_WINDOW_MS,
  RecentAuthRequiredError,
  assertRecentAuthentication,
  deleteAccountData,
  deleteQueryWithBulkWriter,
} from "../lib/deleteAccount.js";

const createDatabase = ({ transactionIds = [], failDeleteOf = null, userError = null } = {}) => {
  const remaining = new Map(transactionIds.map((id) => [id, { id, ref: { id } }]));
  const calls = { deleted: [], userDeleted: false, closed: false };
  let errorHandler = () => false;

  const query = {
    limit(size) {
      return { get: async () => {
        const docs = [...remaining.values()].slice(0, size);
        return { empty: docs.length === 0, size: docs.length, docs };
      } };
    },
  };

  return {
    calls,
    database: {
      collection(name) {
        if (name === "transactions") return { where: () => query };
        if (name === "recurring") return { where: () => ({ limit: () => ({ get: async () => ({ empty: true, size: 0, docs: [] }) }) }) };
        return { doc: () => ({ delete: async () => {
          if (userError) throw userError;
          calls.userDeleted = true;
        } }) };
      },
      bulkWriter() {
        return {
          onWriteError(handler) { errorHandler = handler; },
          delete(ref) {
            if (ref.id === failDeleteOf) {
              errorHandler({ failedAttempts: 5 });
              return;
            }
            calls.deleted.push(ref.id);
            remaining.delete(ref.id);
          },
          flush: async () => {},
          close: async () => { calls.closed = true; },
        };
      },
    },
  };
};

describe("assertRecentAuthentication", () => {
  const now = 1_000_000_000_000;

  it("accepts a sign-in inside the window", () => {
    assert.doesNotThrow(() => assertRecentAuthentication({ auth_time: (now - 1000) / 1000 }, now));
  });

  it("rejects a stale or missing auth_time", () => {
    assert.throws(() => assertRecentAuthentication({ auth_time: (now - RECENT_AUTH_WINDOW_MS - 1000) / 1000 }, now), RecentAuthRequiredError);
    assert.throws(() => assertRecentAuthentication({}, now), RecentAuthRequiredError);
    assert.throws(() => assertRecentAuthentication(undefined, now), RecentAuthRequiredError);
  });
});

describe("deleteQueryWithBulkWriter", () => {
  it("deletes every page and closes the writer", async () => {
    const { database, calls } = createDatabase({ transactionIds: ["a", "b", "c", "d", "e"] });
    const deleted = await deleteQueryWithBulkWriter(database, database.collection("transactions").where(), { pageSize: 2 });
    assert.equal(deleted, 5);
    assert.deepEqual(calls.deleted.sort(), ["a", "b", "c", "d", "e"]);
    assert.equal(calls.closed, true);
  });

  it("throws instead of reporting success when a delete keeps failing", async () => {
    const { database, calls } = createDatabase({ transactionIds: ["a", "b"], failDeleteOf: "b" });
    await assert.rejects(deleteQueryWithBulkWriter(database, database.collection("transactions").where(), { pageSize: 10 }), /Unable to delete 1/);
    assert.equal(calls.closed, true);
  });
});

describe("deleteAccountData", () => {
  it("removes transactions, profile and the Auth user, in that order", async () => {
    const order = [];
    const { database, calls } = createDatabase({ transactionIds: ["a", "b"] });
    const auth = { deleteUser: async (uid) => { order.push(`auth:${uid}`); } };
    const originalCollection = database.collection.bind(database);
    database.collection = (name) => {
      const result = originalCollection(name);
      if (name === "users") return { doc: () => ({ delete: async () => { order.push("profile"); calls.userDeleted = true; } }) };
      return result;
    };
    const result = await deleteAccountData({ database, auth, uid: "u1" });
    assert.deepEqual(result, { deletedTransactions: 2 });
    assert.deepEqual(order, ["profile", "auth:u1"]);
  });

  it("is safe to retry when the profile or Auth user is already gone", async () => {
    const { database } = createDatabase({ userError: Object.assign(new Error("missing"), { code: 5 }) });
    const auth = { deleteUser: async () => { throw Object.assign(new Error("gone"), { code: "auth/user-not-found" }); } };
    assert.deepEqual(await deleteAccountData({ database, auth, uid: "u1" }), { deletedTransactions: 0 });
  });

  it("surfaces unexpected Auth errors", async () => {
    const { database } = createDatabase();
    const auth = { deleteUser: async () => { throw Object.assign(new Error("boom"), { code: "auth/internal-error" }); } };
    await assert.rejects(deleteAccountData({ database, auth, uid: "u1" }), /boom/);
  });
});
