import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const deleteQueryInBatches = async (query, batchSize = 400) => {
  const database = getFirestore();
  let deleted = 0;
  while (true) {
    const snapshot = await query.limit(batchSize).get();
    if (snapshot.empty) return deleted;
    const batch = database.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
};

export const deleteAccount = onCall(
  { region: "europe-west1", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");

    const authTime = Number(request.auth.token.auth_time || 0) * 1000;
    if (!authTime || Date.now() - authTime > 5 * 60 * 1000) {
      throw new HttpsError("failed-precondition", "Recent authentication required.");
    }

    const database = getFirestore();
    const transactions = database
      .collection("transactions")
      .where("userId", "==", uid);

    const deletedTransactions = await deleteQueryInBatches(transactions);
    await database.collection("users").doc(uid).delete().catch((error) => {
      if (error.code !== 5) throw error;
    });
    await getAuth().deleteUser(uid);

    return { deletedTransactions };
  }
);
