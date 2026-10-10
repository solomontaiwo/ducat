import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { firestore } from "../utils/firebaseFirestore.js";
import { budgetLimitsSchema, preferencesSchema, recurringInputSchema, recurringPatchSchema } from "../schemas/planning.js";

const RECURRING = "recurring";
const BUDGETS = "budgets";
const PREFERENCES = "preferences";

/** Recurring rules and monthly budgets, stored next to the transactions. */
export const PlanningService = {
  subscribeRecurring: (userId, onData, onError) => onSnapshot(
    query(collection(firestore, RECURRING), where("userId", "==", userId)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    onError
  ),

  addRecurring: async (userId, data) => {
    const input = recurringInputSchema.parse(data);
    const reference = doc(collection(firestore, RECURRING));
    await setDoc(reference, { ...input, userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return reference.id;
  },

  updateRecurring: async (id, patch) => {
    const parsed = recurringPatchSchema.parse(patch);
    await updateDoc(doc(firestore, RECURRING, id), { ...parsed, updatedAt: serverTimestamp() });
  },

  deleteRecurring: (id) => deleteDoc(doc(firestore, RECURRING, id)),

  subscribeBudgets: (userId, onData, onError) => onSnapshot(
    doc(firestore, BUDGETS, userId),
    (snapshot) => onData(snapshot.exists() ? snapshot.data().limits || {} : {}),
    onError
  ),

  subscribePreferences: (userId, onData, onError) => onSnapshot(
    doc(firestore, PREFERENCES, userId),
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    onError
  ),

  savePreferences: async (userId, preferences) => {
    const parsed = preferencesSchema.parse(preferences);
    await setDoc(doc(firestore, PREFERENCES, userId), { ...parsed, userId, updatedAt: serverTimestamp() });
  },

  saveBudgets: async (userId, limits) => {
    const parsed = budgetLimitsSchema.parse(limits);
    await setDoc(doc(firestore, BUDGETS, userId), { userId, limits: parsed, updatedAt: serverTimestamp() });
  },
};
