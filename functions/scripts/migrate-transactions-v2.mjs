import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const apply = args.has("--apply");
const projectId = valueAfter("--project") || process.env.GOOGLE_CLOUD_PROJECT;

if (!projectId) {
  throw new Error("Specify the target explicitly with --project <firebase-project-id>.");
}
if (apply && !args.has("--confirm-backup")) {
  throw new Error("Apply mode requires --confirm-backup after completing a Firestore export.");
}

initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore();
const pageSize = 400;
let cursor;
let scanned = 0;
let migrated = 0;
let invalid = 0;

const timeZone = valueAfter("--timezone") || "Europe/Rome";
const localFormatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

// Same rule as src/utils/dateUtils.js: legacy values saved at midnight UTC keep their UTC
// calendar day; any other instant is converted to the user's local calendar day.
const toDateKey = (value) => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid date");
  const isUtcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return isUtcMidnight ? date.toISOString().slice(0, 10) : localFormatter.format(date);
};

while (true) {
  let query = database.collection("transactions").orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  if (snapshot.empty) break;

  const batch = database.batch();
  let writes = 0;
  for (const document of snapshot.docs) {
    scanned += 1;
    cursor = document;
    const data = document.data();
    if (data.schemaVersion === 2) continue;
    try {
      const amountMinor = Math.round(Number(data.amount) * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) {
        throw new Error("invalid amount");
      }
      const dateKey = toDateKey(data.date);
      if (apply) {
        batch.update(document.ref, {
          amountMinor,
          currency: "EUR",
          dateKey,
          schemaVersion: 2,
          updatedAt: Timestamp.now(),
        });
        writes += 1;
      }
      migrated += 1;
    } catch (error) {
      invalid += 1;
      console.error(JSON.stringify({ id: document.id, error: error.message }));
    }
  }
  if (apply && writes > 0) await batch.commit();
  console.log(JSON.stringify({ projectId, mode: apply ? "apply" : "dry-run", scanned, migratable: migrated, invalid }));
  if (snapshot.size < pageSize) break;
}

console.log(JSON.stringify({ complete: true, projectId, mode: apply ? "apply" : "dry-run", scanned, migratable: migrated, invalid }));
if (invalid > 0) process.exitCode = 2;
