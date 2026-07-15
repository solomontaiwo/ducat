import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { firestore } from "../utils/firebase.jsx";
import { budgetInputSchema } from "../schemas/budget.jsx";

const COLLECTION_NAME = "budgets";
const normalizeBudget = (snapshotDoc) => ({ ...snapshotDoc.data(), id: snapshotDoc.id, limit: Number(snapshotDoc.data().limit) || 0, alertThreshold: Number(snapshotDoc.data().alertThreshold) || 80 });

export const BudgetService = {
  fetchAll: async (userId) => {
    const snapshot = await getDocs(query(collection(firestore, COLLECTION_NAME), where("userId", "==", userId), orderBy("createdAt", "desc")));
    return snapshot.docs.map(normalizeBudget);
  },
  add: async (userId, data) => {
    const parsed = budgetInputSchema.parse({ ...data, limit: Number(data.limit), alertThreshold: Number(data.alertThreshold) });
    return addDoc(collection(firestore, COLLECTION_NAME), { userId, ...parsed, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  },
  update: async (id, data) => {
    const parsed = budgetInputSchema.partial().parse({ ...data, ...(data.limit !== undefined ? { limit: Number(data.limit) } : {}), ...(data.alertThreshold !== undefined ? { alertThreshold: Number(data.alertThreshold) } : {}) });
    return updateDoc(doc(firestore, COLLECTION_NAME, id), { ...parsed, updatedAt: serverTimestamp() });
  },
  delete: async (id) => deleteDoc(doc(firestore, COLLECTION_NAME, id)),
};
