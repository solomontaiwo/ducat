import { isValid, parse } from "date-fns";
import { dateKeyToDate, isDateKey } from "./dateUtils.js";
import { MAX_AMOUNT_MINOR, minorToMajor } from "./money.js";
import { suggestCategory } from "./categorySuggest.js";

const DATE_FORMATS = ["yyyy-MM-dd", "dd/MM/yyyy", "dd-MM-yyyy", "dd.MM.yyyy", "yyyy/MM/dd", "MM/dd/yyyy"];

const HEADER_HINTS = {
  date: ["data", "date", "valuta", "contabile", "booking", "giorno", "started"],
  description: ["descrizione", "description", "causale", "dettaglio", "merchant", "beneficiario", "note", "titolo", "name"],
  amount: ["importo", "amount", "valore", "totale", "eur", "euro"],
  debit: ["dare", "uscite", "uscita", "addebiti", "addebito", "debit", "outflow"],
  credit: ["avere", "entrate", "entrata", "accrediti", "accredito", "credit", "inflow"],
  category: ["categoria", "category", "gruppo", "tag"],
  type: ["tipo", "type", "segno", "direzione"],
};

const detectDelimiter = (sampleLine) => {
  let inQuotes = false;
  const counts = { ";": 0, ",": 0, "\t": 0 };
  for (let i = 0; i < sampleLine.length; i += 1) {
    const ch = sampleLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  if (counts[";"] >= counts[","] && counts[";"] > 0) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > 0) return "\t";
  return ",";
};

/** RFC-4180 CSV parser supporting `,`, `;` and tab delimiters, BOM and quoted newlines. */
export const parseCsvText = (rawText) => {
  const text = String(rawText || "").replace(/^\uFEFF/, "").trim();
  if (!text) return { headers: [], rows: [], delimiter: "," };

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = detectDelimiter(firstLine);

  const records = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cell.trim());
      records.push(row);
      row = [];
      cell = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell.trim());
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    records.push(row);
  }

  const nonEmpty = records.filter((entry) => entry.some((value) => value !== ""));
  if (nonEmpty.length < 2) return { headers: nonEmpty[0] || [], rows: [], delimiter };
  return {
    headers: nonEmpty[0],
    rows: nonEmpty.slice(1),
    delimiter,
  };
};

/** Automatically guesses column indices from Italian or English CSV headers. */
export const detectCsvColumns = (headers = []) => {
  const normalized = headers.map((h) => String(h || "").toLowerCase().trim());
  const pick = (hints, exclude = new Set()) => {
    for (const hint of hints) {
      const idx = normalized.findIndex((header, index) => !exclude.has(index) && (header === hint || header.includes(hint)));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const used = new Set();
  const date = pick(HEADER_HINTS.date, used);
  if (date >= 0) used.add(date);
  const description = pick(HEADER_HINTS.description, used);
  if (description >= 0) used.add(description);
  const amount = pick(HEADER_HINTS.amount, used);
  if (amount >= 0) used.add(amount);
  const debit = pick(HEADER_HINTS.debit, used);
  if (debit >= 0) used.add(debit);
  const credit = pick(HEADER_HINTS.credit, used);
  if (credit >= 0) used.add(credit);
  const category = pick(HEADER_HINTS.category, used);
  if (category >= 0) used.add(category);
  const type = pick(HEADER_HINTS.type, used);

  return { date, description, amount, debit, credit, category, type };
};

/** Parses common ISO, Italian and bank CSV date strings into `YYYY-MM-DD`. */
export const parseFlexibleDateKey = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return null;
  const isoPrefix = text.slice(0, 10);
  if (isDateKey(isoPrefix)) return isoPrefix;

  const datePart = text.split(/[ T]/, 1)[0];
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(datePart, fmt, new Date(2000, 0, 1));
    if (isValid(parsed) && parsed.getFullYear() >= 1970 && parsed.getFullYear() <= 2100) {
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      if (isDateKey(key)) return key;
    }
  }
  return null;
};

/** Parses signed, currency-decorated or Italian-formatted numbers into minor units + sign. */
export const parseFlexibleAmount = (raw) => {
  let text = String(raw || "").trim();
  if (!text) return null;

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/[€$£\s]/g, "").replace(/EUR/gi, "");
  if (text.endsWith("-") || text.endsWith("−")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!text || !/^[0-9.,]+$/.test(text)) return null;

  let numeric;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // Italian / European: 1.234,56
      numeric = Number(text.replace(/\./g, "").replace(",", "."));
    } else {
      // US / ISO: 1,234.56
      numeric = Number(text.replace(/,/g, ""));
    }
  } else if (lastComma >= 0) {
    // Thousands-only US grouping ("1,200" or "1,234,567") vs European decimal ("12,50").
    numeric = /^\d{1,3}(,\d{3})+$/.test(text)
      ? Number(text.replace(/,/g, ""))
      : Number(text.replace(",", "."));
  } else if (lastDot >= 0) {
    // Thousands-only European grouping ("1.200" or "1.234.567") vs decimal ("12.50").
    numeric = /^\d{1,3}(\.\d{3})+$/.test(text)
      ? Number(text.replace(/\./g, ""))
      : Number(text);
  } else {
    numeric = Number(text);
  }

  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const amountMinor = Math.round(numeric * 100);
  if (amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) return null;
  return {
    sign: negative ? "expense" : "income",
    amountMinor,
  };
};

const normalizeCategoryValue = (raw, list) => {
  const needle = String(raw || "").trim().toLowerCase();
  if (!needle) return "";
  const match = list.find((item) => (
    item.value.toLowerCase() === needle || item.label.toLowerCase() === needle
  ));
  return match?.value || "";
};

const normalizeTypeHint = (raw) => {
  const value = String(raw || "").trim().toLowerCase();
  if (["entrata", "entrate", "income", "credit", "avere", "+"].includes(value)) return "income";
  if (["uscita", "uscite", "spesa", "expense", "debit", "dare", "-"].includes(value)) return "expense";
  return null;
};

const slugHash = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const dedupeSignature = (dateKey, type, amountMinor, description) => (
  `${dateKey}|${type}|${amountMinor}|${description.trim().toLowerCase()}`
);

/**
 * Converts CSV rows into validated Ducat transactions with auto-categorization,
 * duplicate detection against existing history, and deterministic clientRequestIds.
 */
export const mapCsvRowsToTransactions = (
  rows = [],
  mapping = {},
  { existing = [], expenseCategories = [], incomeCategories = [], defaultNegative = false } = {}
) => {
  const existingCounts = new Map();
  for (const item of existing) {
    const key = dedupeSignature(item.dateKey || "", item.type, item.amountMinor ?? Math.round((item.amount || 0) * 100), item.description || "");
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
  }

  const seenInBatch = new Map();
  const valid = [];
  const recordNumbers = new Map();
  let skipped = 0;
  let duplicates = 0;

  for (const [index, row] of rows.entries()) {
    const dateKey = mapping.date >= 0 ? parseFlexibleDateKey(row[mapping.date]) : null;
    if (!dateKey) { skipped += 1; continue; }

    let amountInfo = null;
    let resolvedType = null;
    if (mapping.amount >= 0 && row[mapping.amount]) {
      amountInfo = parseFlexibleAmount(row[mapping.amount]);
      if (amountInfo) {
        const typeHint = mapping.type >= 0 ? normalizeTypeHint(row[mapping.type]) : null;
        if (typeHint) {
          resolvedType = typeHint;
        } else if (/^[-−(]/.test(String(row[mapping.amount]).trim()) || /[-−]$/.test(String(row[mapping.amount]).trim())) {
          resolvedType = "expense";
        } else if (String(row[mapping.amount]).trim().startsWith("+")) {
          resolvedType = "income";
        } else {
          resolvedType = defaultNegative ? "expense" : amountInfo.sign;
        }
      }
    } else {
      const debitVal = mapping.debit >= 0 ? parseFlexibleAmount(row[mapping.debit]) : null;
      const creditVal = mapping.credit >= 0 ? parseFlexibleAmount(row[mapping.credit]) : null;
      if (debitVal) {
        amountInfo = debitVal;
        resolvedType = "expense";
      } else if (creditVal) {
        amountInfo = creditVal;
        resolvedType = "income";
      }
    }

    if (!amountInfo || !resolvedType) { skipped += 1; continue; }

    const rawDesc = mapping.description >= 0 ? String(row[mapping.description] || "").trim() : "";
    const description = (rawDesc || (resolvedType === "income" ? "Entrata" : "Spesa")).slice(0, 200);

    const catList = resolvedType === "income" ? incomeCategories : expenseCategories;
    const rawCat = mapping.category >= 0 ? normalizeCategoryValue(row[mapping.category], catList) : "";
    const suggested = rawCat
      ? rawCat
      : suggestCategory(description, {
        type: resolvedType,
        history: existing,
        categories: catList.map((item) => item.value),
      })?.category || catList[0]?.value || (resolvedType === "income" ? "stipendio" : "altro");

    const sig = dedupeSignature(dateKey, resolvedType, amountInfo.amountMinor, description);
    const seenCount = (seenInBatch.get(sig) || 0) + 1;
    seenInBatch.set(sig, seenCount);

    if ((existingCounts.get(sig) || 0) >= seenCount) {
      duplicates += 1;
      continue;
    }

    const clientRequestId = `csv-${dateKey}-${slugHash(`${sig}#${seenCount}`)}`;
    recordNumbers.set(clientRequestId, index + 1);
    valid.push({
      type: resolvedType,
      amountMinor: amountInfo.amountMinor,
      amount: minorToMajor(amountInfo.amountMinor),
      description,
      category: suggested,
      dateKey,
      date: dateKeyToDate(dateKey),
      clientRequestId,
    });
  }

  return { valid, skipped, duplicates, recordNumbers };
};
