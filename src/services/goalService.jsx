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
import { goalInputSchema } from "../schemas/goal.jsx";

const COLLECTION_NAME = "goals";

const normalizeGoal = (snapshotDoc) => {
  const data = snapshotDoc.data();
  return {
    ...data,
    id: snapshotDoc.id,
    targetAmount: Number(data.targetAmount) || 0,
    currentAmount: Number(data.currentAmount) || 0,
    autoContributeAmount: Number(data.autoContributeAmount) || 0,
    dueDate:
      typeof data.dueDate?.toDate === "function"
        ? data.dueDate.toDate()
        : new Date(data.dueDate),
  };
};

export const GoalService = {
  fetchAll: async (userId) => {
    const q = query(
      collection(firestore, COLLECTION_NAME),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizeGoal);
  },

  add: async (userId, data) => {
    const parsed = goalInputSchema.parse({
      ...data,
      targetAmount: Number(data.targetAmount),
      currentAmount: Number(data.currentAmount || 0),
      autoContributeAmount: Number(data.autoContributeAmount || 0),
      dueDate: data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate),
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
    const parsed = goalInputSchema.partial().parse({
      ...data,
      ...(data.targetAmount !== undefined
        ? { targetAmount: Number(data.targetAmount) }
        : {}),
      ...(data.currentAmount !== undefined
        ? { currentAmount: Number(data.currentAmount) }
        : {}),
      ...(data.autoContributeAmount !== undefined
        ? { autoContributeAmount: Number(data.autoContributeAmount) }
        : {}),
      ...(data.dueDate !== undefined
        ? {
            dueDate:
              data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate),
          }
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
