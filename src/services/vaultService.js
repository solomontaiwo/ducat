import { supabase, unwrap } from "../utils/supabaseClient.js";
import { vaultCrypto } from "../utils/vaultCrypto.js";
import { readVaultLocal, storeVaultLocal } from "../utils/vaultStorage.js";
import { clearOfflineForUser } from "../utils/offlineCache.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";

const TABLE = "vault_accounts";
const PAGE_SIZE = 500;
const MIGRATION_BATCH_SIZE = 100;
const MAX_RETRIES = 8;
const call = async (name, args) => unwrap(await supabase.rpc(name, args));
const networkError = (error) => error.code === "unknown" && /fetch|network|load failed|timeout/i.test(error.message);
const readAccount = async (uid) => unwrap(await supabase.from(TABLE)
  .select("keys, active, revision").eq("user_id", uid).maybeSingle());

export const loadVaultAccount = async (uid) => {
  try {
    const account = await readAccount(uid);
    if (account?.active) await storeVaultLocal(uid, "keys", account).catch(() => {});
    return account;
  } catch (error) {
    if (navigator.onLine !== false && !networkError(error)) throw error;
    const account = await readVaultLocal(uid, "keys").catch(() => null);
    if (account?.active) return account;
    throw error;
  }
};

export const watchVaultAccount = (uid, reload) => watchTable({ supabase, table: TABLE, userId: uid, reload, watchDeletes: false });

export const startVault = (uid, keys) => call("start_vault", { p_user: uid, p_keys: keys });

const recordKey = ({ kind, id }) => JSON.stringify([kind, id]);
const readLegacyRecords = async (uid) => {
  const result = [];
  let kind = "";
  let id = "";
  let page;
  do {
    page = await call("read_vault_legacy", { p_user: uid, p_kind: kind, p_id: id });
    result.push(...page);
    if (page.length) ({ kind, id } = page.at(-1));
  } while (page.length === PAGE_SIZE);
  return result;
};

export const openVault = async (uid, key) => {
  const cryptography = await vaultCrypto(uid, key);
  const recoverRecord = async (row) => {
    if (row.ciphertext === null) return null;
    const record = await cryptography.open(row.ciphertext, "record", row.id);
    if (await cryptography.id(record.kind, record.id) !== row.id) throw new Error("Invalid archive record ID");
    return record;
  };
  const encryptRecord = async (record) => {
    const id = await cryptography.id(record.kind, record.id);
    return { id, ciphertext: record.value === null ? null : await cryptography.seal(record, "record", id) };
  };

  let closed = false;
  let revision = 0;
  let initialized = false;
  let lastSync = 0;
  const encrypted = new Map();
  const records = new Map();
  const byKind = new Map();
  let pending = Promise.resolve();
  const requireOpen = () => { if (closed) throw new Error("Archive is locked"); };
  const run = (operation) => {
    const result = pending.then(() => { requireOpen(); return operation(); });
    pending = result.catch(() => {});
    return result;
  };

  const applyRows = (changes) => {
    for (const [row, record] of changes) {
      const previous = records.get(row.id);
      if (record === null) {
        if (previous) byKind.get(previous.kind)?.delete(previous.id);
        encrypted.delete(row.id);
        records.delete(row.id);
      } else {
        encrypted.set(row.id, row);
        records.set(row.id, record);
        if (!byKind.has(record.kind)) byKind.set(record.kind, new Map());
        byKind.get(record.kind).set(record.id, record.value);
      }
    }
  };
  const clearRecords = () => {
    encrypted.clear();
    records.clear();
    byKind.clear();
  };
  const saveSnapshot = () => {
    const snapshot = { revision, rows: [...encrypted.values()] };
    return storeVaultLocal(uid, "snapshot", snapshot, (stored) => !closed && (!stored || stored.revision <= snapshot.revision)).catch(() => {});
  };
  const loadSnapshot = async () => {
    const cached = await readVaultLocal(uid, "snapshot").catch(() => null);
    if (!cached) return;
    const decoded = [];
    for (let offset = 0; offset < cached.rows.length; offset += PAGE_SIZE) {
      const chunk = cached.rows.slice(offset, offset + PAGE_SIZE);
      decoded.push(...await Promise.all(chunk.map(async (row) => [row, await recoverRecord(row)])));
    }
    requireOpen();
    applyRows(decoded);
    revision = cached.revision;
    initialized = true;
  };

  const sync = async ({ offline = true, force = false } = {}) => {
    if (!force && initialized && Date.now() - lastSync < 300) return;
    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        const account = await readAccount(uid);
        requireOpen();
        if (!account) throw new Error("Archive unavailable");
        if (account.revision < revision) {
          clearRecords();
          revision = 0;
          initialized = false;
        }
        const through = account.revision;
        if (through !== revision || !initialized) {
          let after = revision;
          let id = null;
          let rows;
          const changes = [];
          do {
            rows = await call("read_vault_changes", { p_user: uid, p_after: after, p_id: id, p_through: through });
            changes.push(...await Promise.all(rows.map(async (row) => [row, await recoverRecord(row)])));
            if (rows.length) ({ revision: after, id } = rows.at(-1));
          } while (rows.length === PAGE_SIZE);
          const latest = await readAccount(uid);
          if (latest?.revision !== through || latest.active !== account.active) continue;
          requireOpen();
          applyRows(changes);
          revision = through;
          initialized = true;
          if (account.active) await saveSnapshot();
        }
        lastSync = Date.now();
        return account;
      }
      throw new Error("Archive changed while syncing. Retry the operation.");
    } catch (error) {
      if (offline && initialized && (navigator.onLine === false || networkError(error))) return null;
      throw error;
    }
  };

  const write = async (changes, active) => {
    const rows = [];
    for (let offset = 0; offset < changes.length; offset += PAGE_SIZE) {
      rows.push(...await Promise.all(changes.slice(offset, offset + PAGE_SIZE).map(encryptRecord)));
    }
    requireOpen();
    const saved = await call("write_vault", { p_user: uid, p_revision: revision, p_active: active, p_changes: rows });
    requireOpen();
    if (!saved) return false;
    revision += 1;
    applyRows(rows.map((row, index) => [{ ...row, revision }, row.ciphertext === null ? null : changes[index]]));
    lastSync = 0;
    if (active) await saveSnapshot();
    return true;
  };

  const view = {
    get: (kind, id) => byKind.get(kind)?.get(id),
    list: (kind) => [...(byKind.get(kind)?.values() || [])],
  };

  return {
    uid,
    isOpen: () => !closed,
    close() { closed = true; clearRecords(); },
    initialize: (account) => run(async () => {
      if (account.active) await loadSnapshot();
      await sync({ force: true, offline: account.active });
    }),
    migrate: () => run(async () => {
      const initial = await sync({ force: true, offline: false });
      if (initial.active) return;
      const expected = await readLegacyRecords(uid);
      for (let offset = 0; offset < expected.length; offset += MIGRATION_BATCH_SIZE) {
        const page = expected.slice(offset, offset + MIGRATION_BATCH_SIZE);
        let saved = false;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
          const account = await sync({ force: true, offline: false });
          if (account.active) return;
          const missing = page.filter(({ kind, id, value }) => JSON.stringify(view.get(kind, id)) !== JSON.stringify(value));
          if (!missing.length || await write(missing, false)) { saved = true; break; }
        }
        if (!saved) throw new Error("Archive changed during migration");
      }
      // Read back every staged record, including the data uploaded in this session.
      revision = 0;
      initialized = false;
      clearRecords();
      const account = await sync({ force: true, offline: false });
      if (!account.active) {
        const originals = new Map(expected.map((record) => [recordKey(record), JSON.stringify(record.value)]));
        if (records.size !== expected.length || [...records.values()].some((record) =>
          originals.get(recordKey(record)) !== JSON.stringify(record.value))) {
          throw new Error("The encrypted archive does not match the original data");
        }
        requireOpen();
        const finished = await call("finish_vault", { p_user: uid, p_revision: revision });
        if (!finished && !(await sync({ force: true, offline: false })).active) {
          throw new Error("Archive changed during migration");
        }
      }
      await saveSnapshot();
      await loadVaultAccount(uid);
      clearOfflineForUser(uid);
    }),
    read: (select, force = false) => run(async () => {
      await sync({ force });
      requireOpen();
      return select(view);
    }),
    change: (build) => run(async () => {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        await sync({ force: true, offline: false });
        const { changes, result } = build(view);
        if (!changes.length) return result;
        if (await write(changes, true)) {
          emitLocalChange(TABLE);
          return result;
        }
      }
      throw new Error("Archive changed on another device. Retry the operation.");
    }),
    watch: (reload) => watchVaultAccount(uid, () => { lastSync = 0; reload(); }),
    seal: (...args) => { requireOpen(); return cryptography.seal(...args); },
    open: (...args) => { requireOpen(); return cryptography.open(...args); },
  };
};
