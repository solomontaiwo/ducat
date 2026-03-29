import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "../utils/firebase.jsx";
import { budgetInputSchema } from "../schemas/budget.jsx";

const COLLECTION_NAME = "budgets";

const normalizeBudget = (snapshotDoc) => {
  const data = snapshotDoc.data();
  return {
    ...data,
    id: snapshotDoc.id,
    limit: Number(data.limit) || 0,
    alertThreshold: Number(data.alertThreshold) || 80,
  };
};

export const BudgetService = {
  fetchAll: async (userId) => {
    const q = query(
      collection(firestore, COLLECTION_NAME),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizeBudget);
  },

  add: async (userId, data) => {
    const parsed = budgetInputSchema.parse({
      ...data,
      limit: Number(data.limit),
      alertThreshold: Number(data.alertThreshold),
    });

    const result = await addDoc(collection(firestore, COLLECTION_NAME), {
      userId,
      ...parsed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return result;
  },

  update: async (id, data) => {
    const parsed = budgetInputSchema.partial().parse({
      ...data,
      ...(data.limit !== undefined ? { limit: Number(data.limit) } : {}),
      ...(data.alertThreshold !== undefined
        ? { alertThreshold: Number(data.alertThreshold) }
        : {}),
    });

    const ref = doc(firestore, COLLECTION_NAME, id);
    return updateDoc(ref, {
      ...parsed,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (id) => {
    const ref = doc(firestore, COLLECTION_NAME, id);
    return deleteDoc(ref);
  },
};
