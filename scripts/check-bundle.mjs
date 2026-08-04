import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDirectory);
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const entryMatch = html.match(/<script[^>]+src="[^"]*\/assets\/(index-[^"]+\.js)"/);
if (!entryMatch) throw new Error("Unable to resolve the JavaScript entry from dist/index.html");

const budgets = [
  { label: "main", filename: entryMatch[1], maxGzipBytes: 145_000 },
  { label: "analytics", pattern: /^TransactionAnalytics-[^.]+\.js$/, maxGzipBytes: 150_000 },
  { label: "pdf", pattern: /^pdfUtils-[^.]+\.js$/, maxGzipBytes: 155_000 },
];

let failed = false;
for (const budget of budgets) {
  const filename = budget.filename || files.find((file) => budget.pattern.test(file));
  if (!filename) throw new Error(`Missing bundle for ${budget.label}`);
  const bytes = gzipSync(await readFile(new URL(filename, assetsDirectory))).byteLength;
  console.log(`${budget.label}: ${bytes} / ${budget.maxGzipBytes} gzip bytes`);
  if (bytes > budget.maxGzipBytes) failed = true;
}

if (failed) process.exitCode = 1;
