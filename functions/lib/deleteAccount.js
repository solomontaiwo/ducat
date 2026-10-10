export const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000;
export const PAGE_SIZE = 500;
const MAX_WRITE_ATTEMPTS = 5;
const FIRESTORE_NOT_FOUND = 5;

export class RecentAuthRequiredError extends Error {
  constructor() {
    super("Recent authentication required.");
    this.name = "RecentAuthRequiredError";
  }
}

export const assertRecentAuthentication = (token, now = Date.now()) => {
  const authTime = Number(token?.auth_time || 0) * 1000;
  if (!authTime || now - authTime > RECENT_AUTH_WINDOW_MS) throw new RecentAuthRequiredError();
};

/**
 * Deletes every document matched by `query` using a BulkWriter, one page at a
 * time. Fails loudly if a write keeps failing so the caller never reports a
 * partial deletion as success (the operation is safe to retry).
 */
export const deleteQueryWithBulkWriter = async (database, query, { pageSize = PAGE_SIZE } = {}) => {
  const writer = database.bulkWriter();
  let failures = 0;
  writer.onWriteError((error) => {
    if (error.failedAttempts < MAX_WRITE_ATTEMPTS) return true;
    failures += 1;
    return false;
  });

  let deleted = 0;
  try {
    for (;;) {
      const snapshot = await query.limit(pageSize).get();
      if (snapshot.empty) break;
      snapshot.docs.forEach((document) => { writer.delete(document.ref); });
      await writer.flush();
      if (failures > 0) throw new Error(`Unable to delete ${failures} transaction document(s).`);
      deleted += snapshot.size;
    }
  } finally {
    await writer.close();
  }
  return deleted;
};

export const deleteAccountData = async ({ database, auth, uid, logger }) => {
  const transactions = database.collection("transactions").where("userId", "==", uid);
  const deletedTransactions = await deleteQueryWithBulkWriter(database, transactions);
  // Recurring rules and the budget document belong to the same account.
  await deleteQueryWithBulkWriter(database, database.collection("recurring").where("userId", "==", uid));

  for (const [collection, id] of [["budgets", uid], ["preferences", uid], ["users", uid]]) {
    try {
      await database.collection(collection).doc(id).delete();
    } catch (error) {
      if (error.code !== FIRESTORE_NOT_FOUND) throw error;
    }
  }

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    // A previous attempt may already have removed the Auth user.
    if (error.code !== "auth/user-not-found") throw error;
  }

  logger?.info("Account deleted", { deletedTransactions });
  return { deletedTransactions };
};
