import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDirectory);
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const entryMatch = html.match(/<script[^>]+src="[^"]*\/assets\/(index-[^"]+\.js)"/);
if (!entryMatch) throw new Error("Unable to resolve the JavaScript entry from dist/index.html");

// Everything the browser fetches before the first route renders: the entry
// script plus every modulepreload hint emitted by Vite.
const initialFiles = [...new Set([
  entryMatch[1],
  ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="[^"]*\/assets\/([^"]+\.js)"/g)].map((match) => match[1]),
])];
let initialBytes = 0;
for (const filename of initialFiles) {
  initialBytes += gzipSync(await readFile(new URL(filename, assetsDirectory))).byteLength;
}
const INITIAL_BUDGET = 155_000;
console.log(`initial (${initialFiles.length} files): ${initialBytes} / ${INITIAL_BUDGET} gzip bytes`);

const budgets = [
  { label: "main", filename: entryMatch[1], maxGzipBytes: 95_000 },
  { label: "analytics", pattern: /^TransactionAnalytics-[^.]+\.js$/, maxGzipBytes: 150_000 },
  { label: "pdf", pattern: /^pdfUtils-[^.]+\.js$/, maxGzipBytes: 155_000 },
  // English is loaded on demand; keep its chunk from creeping into the initial payload.
  { label: "english locale", pattern: /^translation-[^.]+\.js$/, maxGzipBytes: 12_000 },
];

let failed = initialBytes > INITIAL_BUDGET;
for (const budget of budgets) {
  const filename = budget.filename || files.find((file) => budget.pattern.test(file));
  if (!filename) throw new Error(`Missing bundle for ${budget.label}`);
  const bytes = gzipSync(await readFile(new URL(filename, assetsDirectory))).byteLength;
  console.log(`${budget.label}: ${bytes} / ${budget.maxGzipBytes} gzip bytes`);
  if (bytes > budget.maxGzipBytes) failed = true;
}

if (failed) process.exitCode = 1;
