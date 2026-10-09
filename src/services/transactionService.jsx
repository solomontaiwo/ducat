import {
  Timestamp,
  collection,
  deleteDoc,
  documentId,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "../utils/firebaseFirestore.js";
import { transactionV2InputSchema, transactionV2PatchSchema } from "../schemas/transaction.jsx";
import { DEFAULT_CURRENCY, getTransactionAmountMinor, minorToMajor, parseMoneyToMinor } from "../utils/money.js";
import { compareTransactions } from "../utils/transactionOrder.js";
import { coerceDateKey, dateKeyToDate, dateKeyToUtcDate, dateToDateKey, nextDateKeyUtcDate } from "../utils/dateUtils.js";

const COLLECTION_NAME = "transactions";
const DEFAULT_TTL_MS = 3 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 40;
const dataCache = new Map();
const countCache = new Map();
const inFlight = new Map();
let cacheRevision = 0;

const safeId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export { compareTransactions };

const normalizeDocument = (snapshot) => {
  const raw = snapshot.data();
  const amountMinor = getTransactionAmountMinor(raw);
  const dateKey = raw.dateKey || dateToDateKey(raw.date);
  return {
    ...raw,
    id: snapshot.id,
    amountMinor,
    amount: minorToMajor(amountMinor),
    currency: raw.currency || DEFAULT_CURRENCY,
    dateKey,
    date: dateKeyToDate(dateKey),
    schemaVersion: raw.schemaVersion || 1,
  };
};

const normalizeSnapshot = (snapshot, onInvalid) => snapshot.docs.flatMap((item) => {
  try {
    return [normalizeDocument(item)];
  } catch (error) {
    onInvalid?.({ id: item.id, code: "invalid-transaction", error });
    return [];
  }
}).sort(compareTransactions);

const buildConstraints = ({ userId, type = "all", startDate, endDate, ordered = true }) => {
  const constraints = [where("userId", "==", userId)];
  if (type !== "all") constraints.push(where("type", "==", type));
  if (startDate) constraints.push(where("date", ">=", Timestamp.fromDate(dateKeyToUtcDate(coerceDateKey(startDate)))));
  if (endDate) constraints.push(where("date", "<", Timestamp.fromDate(nextDateKeyUtcDate(endDate))));
  if (ordered) {
    constraints.push(orderBy("date", "desc"));
    constraints.push(orderBy(documentId(), "desc"));
  }
  return constraints;
};

const queryKey = ({ userId, type = "all", startDate, endDate }) => [
  userId,
  type,
  startDate ? coerceDateKey(startDate) : "start",
  endDate ? coerceDateKey(endDate) : "end",
].join(":");

const dedupe = async (key, loader) => {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = loader().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
};

const invalidateCache = () => {
  cacheRevision += 1;
  dataCache.clear();
  countCache.clear();
  inFlight.clear();
};

const isAlreadyCreated = async (reference, userId, error) => {
  if (error?.code !== "permission-denied") return false;
  try {
    const existing = await getDoc(reference);
    return existing.exists() && existing.data().userId === userId;
  } catch {
    return false;
  }
};

const toV2Input = (data) => transactionV2InputSchema.parse({
  amountMinor: Number.isSafeInteger(data.amountMinor) ? data.amountMinor : parseMoneyToMinor(data.amount),
  currency: data.currency || DEFAULT_CURRENCY,
  description: data.description,
  dateKey: data.dateKey || coerceDateKey(data.date),
  category: data.category,
  type: data.type,
});

const toPersistedFields = (input) => ({
  ...input,
  amount: minorToMajor(input.amountMinor),
  date: Timestamp.fromDate(dateKeyToUtcDate(input.dateKey)),
  schemaVersion: 2,
  updatedAt: serverTimestamp(),
});

export const TransactionService = {
  subscribeToRecent: (userId, limitCount, onUpdate, onError, onInvalid) => {
    const recentQuery = query(
      collection(firestore, COLLECTION_NAME),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );

    return onSnapshot(recentQuery, (snapshot) => {
      invalidateCache();
      onUpdate(normalizeSnapshot(snapshot, onInvalid), snapshot.docChanges().map((change) => ({
        type: change.type,
        id: change.doc.id,
      })));
    }, onError);
  },

  fetchRange: async (userId, options = {}) => {
    const {
      forceRefresh = false,
      ttlMs = DEFAULT_TTL_MS,
      onRevalidated,
      revalidateIfFresh = false,
      onInvalid,
      type = "all",
      startDate,
      endDate,
    } = options;
    const key = queryKey({ userId, type, startDate, endDate });
    const cached = dataCache.get(key);
    const isFresh = cached && Date.now() - cached.cachedAt < ttlMs;

    const load = () => dedupe(`range:${key}`, async () => {
      const revision = cacheRevision;
      const rangeQuery = query(
        collection(firestore, COLLECTION_NAME),
        ...buildConstraints({ userId, type, startDate, endDate })
      );
      const snapshot = await getDocs(rangeQuery);
      if (revision !== cacheRevision) return load();
      const data = normalizeSnapshot(snapshot, onInvalid);
      dataCache.set(key, { data, cachedAt: Date.now() });
      return data;
    });

    if (!forceRefresh && isFresh) {
      if (revalidateIfFresh) load().then((data) => onRevalidated?.(data)).catch(() => {});
      return cached.data;
    }
    return load();
  },

  fetchAll: (userId, options = {}) => TransactionService.fetchRange(userId, options),

  fetchPage: async (userId, { pageSize = DEFAULT_PAGE_SIZE, cursor = null, onInvalid, type = "all", startDate, endDate } = {}) => {
    const constraints = buildConstraints({ userId, type, startDate, endDate });
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const snapshot = await getDocs(query(collection(firestore, COLLECTION_NAME), ...constraints));
    return {
      items: normalizeSnapshot(snapshot, onInvalid),
      nextCursor: snapshot.docs.at(-1) || null,
      hasMore: snapshot.size === pageSize,
    };
  },

  getTotalCount: async (userId, options = {}) => {
    const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, type = "all", startDate, endDate } = options;
    const key = queryKey({ userId, type, startDate, endDate });
    const cached = countCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) return cached.count;

    const load = () => dedupe(`count:${key}`, async () => {
      const revision = cacheRevision;
      const countQuery = query(
        collection(firestore, COLLECTION_NAME),
        ...buildConstraints({ userId, type, startDate, endDate, ordered: false })
      );
      const snapshot = await getCountFromServer(countQuery);
      if (revision !== cacheRevision) return load();
      const count = snapshot.data().count;
      countCache.set(key, { count, cachedAt: Date.now() });
      return count;
    });
    return load();
  },

  add: async (userId, data, { requestId = crypto.randomUUID() } = {}) => {
    const input = toV2Input(data);
    const reference = doc(firestore, COLLECTION_NAME, `${safeId(userId)}_${safeId(requestId)}`);
    try {
      await setDoc(reference, {
        userId,
        ...toPersistedFields(input),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      // A retry reuses the same document ID. If the first attempt actually
      // reached the server, this second write is evaluated as an update and the
      // rules reject it (createdAt must not change). The data is already saved,
      // so confirm that instead of reporting a failure.
      if (!(await isAlreadyCreated(reference, userId, error))) throw error;
    }
    invalidateCache();
    return reference;
  },

  update: async (id, data) => {
    const rawPatch = {};
    if (data.amount !== undefined || data.amountMinor !== undefined) {
      rawPatch.amountMinor = Number.isSafeInteger(data.amountMinor) ? data.amountMinor : parseMoneyToMinor(data.amount);
    }
    if (data.currency !== undefined) rawPatch.currency = data.currency;
    if (data.description !== undefined) rawPatch.description = data.description;
    if (data.date !== undefined || data.dateKey !== undefined) rawPatch.dateKey = data.dateKey || coerceDateKey(data.date);
    if (data.category !== undefined) rawPatch.category = data.category;
    if (data.type !== undefined) rawPatch.type = data.type;
    const patch = transactionV2PatchSchema.parse(rawPatch);
    const persistedPatch = { schemaVersion: 2, updatedAt: serverTimestamp() };
    if (patch.amountMinor !== undefined) {
      persistedPatch.amountMinor = patch.amountMinor;
      persistedPatch.amount = minorToMajor(patch.amountMinor);
    }
    if (patch.currency !== undefined) persistedPatch.currency = patch.currency;
    if (patch.description !== undefined) persistedPatch.description = patch.description;
    if (patch.dateKey !== undefined) {
      persistedPatch.dateKey = patch.dateKey;
      persistedPatch.date = Timestamp.fromDate(dateKeyToUtcDate(patch.dateKey));
    }
    if (patch.category !== undefined) persistedPatch.category = patch.category;
    if (patch.type !== undefined) persistedPatch.type = patch.type;

    await updateDoc(doc(firestore, COLLECTION_NAME, id), persistedPatch);
    invalidateCache();
  },

  delete: async (id) => {
    await deleteDoc(doc(firestore, COLLECTION_NAME, id));
    invalidateCache();
  },

  invalidateCache,
  normalizeDocument,
  toV2Input,
  DEFAULT_TTL_MS,
  DEFAULT_PAGE_SIZE,
};
