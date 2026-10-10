#!/usr/bin/env node
/**
 * Copies Soldi Sotto from Firebase to Supabase: accounts (with their
 * passwords), profiles, transactions, recurring rules, budgets, preferences.
 *
 * Safe to run more than once: accounts are matched by email and rows are
 * inserted only when missing.
 *
 * Inputs (environment):
 *   SUPABASE_URL                  https://<ref>.supabase.co
 *   SUPABASE_SECRET_KEY           secret (service_role) key — never ship it to the app
 *   GOOGLE_APPLICATION_CREDENTIALS path to a Firebase service-account JSON
 *   FIREBASE_USERS_FILE           output of `firebase auth:export users.json --format=json`
 *   FIREBASE_HASH_SIGNER_KEY      base64_signer_key   } Firebase console → Authentication →
 *   FIREBASE_HASH_SALT_SEPARATOR  base64_salt_separator } Users → ⋮ → Password hash parameters
 *   FIREBASE_HASH_ROUNDS          rounds              }
 *   FIREBASE_HASH_MEM_COST        mem_cost            }
 *
 * Flags: --dry-run (read and report, write nothing)
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 500;
const TIME_ZONE = "Europe/Rome";

const env = (name, { optional = false } = {}) => {
  const value = process.env[name];
  if (!value && !optional) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
initializeApp({ credential: applicationDefault() });
const firestore = getFirestore();

const hashParams = {
  signerKey: env("FIREBASE_HASH_SIGNER_KEY", { optional: true }),
  saltSeparator: env("FIREBASE_HASH_SALT_SEPARATOR", { optional: true }),
  rounds: env("FIREBASE_HASH_ROUNDS", { optional: true }),
  memCost: env("FIREBASE_HASH_MEM_COST", { optional: true }),
};
const canImportPasswords = Object.values(hashParams).every(Boolean);

const log = (...parts) => console.log(DRY_RUN ? "[dry-run]" : "", ...parts);

// ---------------------------------------------------------------------------
// Helpers

const dateKeyInRome = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const amountMinorOf = (data) => {
  if (Number.isSafeInteger(data.amountMinor)) return data.amountMinor;
  const amount = Number(data.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};

const isDateKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const firebaseScryptHash = (user) => {
  if (!canImportPasswords || !user.passwordHash || !user.salt) return undefined;
  const { signerKey, saltSeparator, rounds, memCost } = hashParams;
  return `$fbscrypt$v=1,n=${memCost},r=${rounds},p=1,ss=${saltSeparator},sk=${signerKey}$${user.salt}$${user.passwordHash}`;
};

const chunks = (items, size) => {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

const insertMissing = async (table, rows, conflict) => {
  if (DRY_RUN || rows.length === 0) return;
  for (const part of chunks(rows, BATCH)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: conflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
};

const existingAccountsByEmail = async () => {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    if (data.users.length < 1000) return byEmail;
  }
};

const byOwner = async (collection) => {
  const snapshot = await firestore.collection(collection).get();
  const owned = new Map();
  for (const document of snapshot.docs) {
    const data = document.data();
    const owner = data.userId || document.id;
    if (!owned.has(owner)) owned.set(owner, []);
    owned.get(owner).push({ id: document.id, data });
  }
  return owned;
};

// ---------------------------------------------------------------------------
// 1. Accounts

const exportFile = JSON.parse(readFileSync(env("FIREBASE_USERS_FILE"), "utf8"));
const firebaseUsers = (exportFile.users || []).filter((user) => user.email);
log(`${firebaseUsers.length} Firebase accounts with an email`);
if (!canImportPasswords) {
  log("Password hash parameters not set: accounts are created without a password (users must use “Password dimenticata?”).");
}

const existing = await existingAccountsByEmail();
const uidMap = new Map(); // Firebase uid -> Supabase id
const profilesSnapshot = await firestore.collection("users").get();
const profilesByUid = new Map(profilesSnapshot.docs.map((document) => [document.id, document.data()]));

for (const user of firebaseUsers) {
  const email = user.email.toLowerCase();
  const profile = profilesByUid.get(user.localId) || {};
  const displayName = String(profile.displayName || profile.username || user.displayName || email.split("@")[0]).trim().slice(0, 50);
  const memberSince = user.createdAt ? new Date(Number(user.createdAt)).toISOString() : null;

  if (existing.has(email)) {
    uidMap.set(user.localId, existing.get(email));
    continue;
  }
  if (DRY_RUN) {
    uidMap.set(user.localId, randomUUID());
    continue;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: Boolean(user.emailVerified),
    password_hash: firebaseScryptHash(user),
    user_metadata: { display_name: displayName, member_since: memberSince, firebase_uid: user.localId },
  });
  if (error) throw new Error(`Account ${email}: ${error.message}`);
  uidMap.set(user.localId, data.user.id);
  log(`account ${email} → ${data.user.id}${user.emailVerified ? "" : " (email not verified)"}`);
}

// ---------------------------------------------------------------------------
// 2. Profiles

const profileRows = [];
for (const [firebaseUid, supabaseId] of uidMap) {
  const profile = profilesByUid.get(firebaseUid);
  if (!profile) continue;
  const name = String(profile.displayName || profile.username || "").trim().slice(0, 50);
  if (!name) continue;
  profileRows.push({ id: supabaseId, username: name, display_name: name, email: profile.email || null });
}
// The database already made a profile for each new account; this sets the
// name the user had chosen.
if (!DRY_RUN) {
  for (const part of chunks(profileRows, BATCH)) {
    const { error } = await supabase.from("profiles").upsert(part, { onConflict: "id" });
    if (error) throw new Error(`profiles: ${error.message}`);
  }
}
log(`${profileRows.length} profiles`);

// ---------------------------------------------------------------------------
// 3. Transactions

const transactions = await byOwner("transactions");
const transactionRows = [];
const skipped = [];
for (const [firebaseUid, documents] of transactions) {
  const userId = uidMap.get(firebaseUid);
  if (!userId) {
    skipped.push(`${documents.length} transactions of unknown account ${firebaseUid}`);
    continue;
  }
  for (const { id, data } of documents) {
    const amountMinor = amountMinorOf(data);
    const date = toDate(data.date);
    const dateKey = isDateKey(data.dateKey) ? data.dateKey : date ? dateKeyInRome(date) : null;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !dateKey || !["income", "expense"].includes(data.type)) {
      skipped.push(`transaction ${id}: invalid data`);
      continue;
    }
    const createdAt = toDate(data.createdAt) || date;
    transactionRows.push({
      id,
      user_id: userId,
      type: data.type,
      amount_minor: amountMinor,
      currency: "EUR",
      description: String(data.description || "—").trim().slice(0, 200) || "—",
      category: String(data.category || "other").trim().slice(0, 60) || "other",
      date_key: dateKey,
      schema_version: 2,
      created_at: createdAt ? createdAt.toISOString() : undefined,
      updated_at: (toDate(data.updatedAt) || createdAt || new Date()).toISOString(),
    });
  }
}
await insertMissing("transactions", transactionRows, "id");
log(`${transactionRows.length} transactions`);

// ---------------------------------------------------------------------------
// 4. Recurring rules (new UUID ids)

const recurring = await byOwner("recurring");
const recurringRows = [];
for (const [firebaseUid, documents] of recurring) {
  const userId = uidMap.get(firebaseUid);
  if (!userId) continue;
  for (const { data } of documents) {
    recurringRows.push({
      id: randomUUID(),
      user_id: userId,
      type: data.type,
      amount_minor: data.amountMinor,
      currency: "EUR",
      description: data.description,
      category: data.category,
      frequency: data.frequency,
      anchor_date_key: data.anchorDateKey,
      next_index: data.nextIndex,
      mode: data.mode,
      paused: Boolean(data.paused),
    });
  }
}
// Rules are matched by content so a second run does not duplicate them.
if (!DRY_RUN && recurringRows.length) {
  const { data: present, error } = await supabase.from("recurring")
    .select("user_id, description, anchor_date_key, frequency, amount_minor");
  if (error) throw new Error(`recurring: ${error.message}`);
  const signature = (row) => [row.user_id, row.description, String(row.anchor_date_key).slice(0, 10), row.frequency, row.amount_minor].join("|");
  const seen = new Set(present.map(signature));
  await insertMissing("recurring", recurringRows.filter((row) => !seen.has(signature(row))), "id");
}
log(`${recurringRows.length} recurring rules`);

// ---------------------------------------------------------------------------
// 5. Budgets and preferences (one document per user, id = uid)

const singleDocuments = async (collection, toRow) => {
  const snapshot = await firestore.collection(collection).get();
  const rows = [];
  for (const document of snapshot.docs) {
    const userId = uidMap.get(document.id);
    if (userId) rows.push(toRow(userId, document.data()));
  }
  return rows;
};

const budgetRows = await singleDocuments("budgets", (userId, data) => ({ user_id: userId, limits: data.limits || {} }));
await insertMissing("budgets", budgetRows, "user_id");
log(`${budgetRows.length} budgets`);

const preferenceRows = await singleDocuments("preferences", (userId, data) => {
  const preferences = { ...data };
  delete preferences.userId;
  delete preferences.updatedAt;
  return { user_id: userId, data: preferences };
});
await insertMissing("preferences", preferenceRows, "user_id");
log(`${preferenceRows.length} preferences`);

// ---------------------------------------------------------------------------
// 6. Check

if (!DRY_RUN) {
  for (const [firebaseUid, supabaseId] of uidMap) {
    const expected = (transactions.get(firebaseUid) || []).length;
    const { count, error } = await supabase.from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseId);
    if (error) throw error;
    const flag = count === expected ? "ok" : "MISMATCH";
    log(`check ${firebaseUid} → ${supabaseId}: ${count}/${expected} transactions ${flag}`);
  }
}
if (skipped.length) {
  console.warn(`Skipped ${skipped.length} item(s):`);
  skipped.forEach((line) => console.warn(`  - ${line}`));
}
log("Done.");
