const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const neutralizeSpreadsheetFormula = (value) => {
  const text = value == null ? "" : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
};

export const escapeCsvCell = (value) => {
  const safe = neutralizeSpreadsheetFormula(value).replace(/"/g, '""');
  return `"${safe}"`;
};

export const serializeCsv = (headers, rows) => {
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
  return `\uFEFF${content}`;
};
