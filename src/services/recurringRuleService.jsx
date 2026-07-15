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
import { recurringRuleInputSchema } from "../schemas/recurringRule.jsx";

const COLLECTION_NAME = "recurringRules";

const normalizeRule = (snapshotDoc) => {
  const data = snapshotDoc.data();
  return {
    ...data,
    id: snapshotDoc.id,
    amount: Number(data.amount) || 0,
    nextDueDate:
      typeof data.nextDueDate?.toDate === "function"
        ? data.nextDueDate.toDate()
        : new Date(data.nextDueDate),
  };
};

export const RecurringRuleService = {
  fetchAll: async (userId) => {
    const rulesQuery = query(
      collection(firestore, COLLECTION_NAME),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(rulesQuery);
    return snapshot.docs.map(normalizeRule);
  },

  add: async (userId, data) => {
    const parsed = recurringRuleInputSchema.parse({
      ...data,
      amount: Number(data.amount),
      nextDueDate: data.nextDueDate instanceof Date ? data.nextDueDate : new Date(data.nextDueDate),
    });
    return addDoc(collection(firestore, COLLECTION_NAME), {
      userId,
      ...parsed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  update: async (id, data) => {
    const parsed = recurringRuleInputSchema.partial().parse({
      ...data,
      ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
      ...(data.nextDueDate !== undefined
        ? { nextDueDate: data.nextDueDate instanceof Date ? data.nextDueDate : new Date(data.nextDueDate) }
        : {}),
    });
    return updateDoc(doc(firestore, COLLECTION_NAME, id), {
      ...parsed,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (id) => deleteDoc(doc(firestore, COLLECTION_NAME, id)),
};
