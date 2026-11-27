const DB_NAME = "ducat-encrypted-archive";
const STORE = "accounts";
let database;

const open = () => {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Archive storage is blocked"));
    }).catch((error) => { database = undefined; throw error; });
  }
  return database;
};

const storage = async (key, change) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, change ? "readwrite" : "readonly");
    const store = transaction.objectStore(STORE);
    const request = store.get(key);
    let result;
    request.onsuccess = () => {
      if (!change) { result = request.result; return; }
      const update = change(request.result);
      if (!update) return;
      if (update.remove) store.delete(key);
      else store.put(update.value, key);
      result = true;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error("Archive storage write aborted"));
  });
};

export const readVaultLocal = (uid, name) => storage(`${uid}:${name}`);
export const storeVaultLocal = (uid, name, value, matches = () => true) => storage(`${uid}:${name}`,
  (current) => matches(current) ? { value } : null);
export const removeVaultLocal = (uid, name) => storage(`${uid}:${name}`, () => ({ remove: true }));
export const clearVaultLocal = (uid) => Promise.all(["snapshot", "keys", "queue", "pin", "device-unlock"].map((name) =>
  removeVaultLocal(uid, name)));
