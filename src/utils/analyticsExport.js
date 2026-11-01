import { saveFile } from "./saveFile.js";
import { serializeCsv } from "./csvUtils";
import { dateToDateKey } from "./dateUtils";
import { generateExportFileName, getCurrentProfileName } from "./downloadUtils.jsx";

const DEFAULT_CSV_HEADERS = ["Data", "Tipo", "Descrizione", "Categoria", "Importo"];

/**
 * CSV of the given transactions. Headers and the type column can be localized;
 * the defaults keep the Italian labels used by older exports and tests.
 */
export const buildAnalyticsCsv = (transactions, { headers = DEFAULT_CSV_HEADERS, typeLabels = null } = {}) => serializeCsv(headers, transactions.map((transaction) => [
  transaction.dateKey || dateToDateKey(transaction.date),
  typeLabels?.[transaction.type] || transaction.type,
  transaction.description || "",
  transaction.category || "",
  transaction.amount.toFixed(2),
]));

export const exportAnalyticsCsv = async ({
  transactions, currentUser, period, periodLabel, startDate, endDate, headers, typeLabels,
}) => {
  if (!transactions?.length) return;
  const blob = new Blob([buildAnalyticsCsv(transactions, { headers, typeLabels })], { type: "text/csv;charset=utf-8;" });
  const profileName = await getCurrentProfileName(currentUser);
  return saveFile(blob, generateExportFileName(periodLabel || period, startDate, endDate, profileName, "csv"));
};

export const exportAnalyticsPdf = async ({
  transactions, currentUser, period, periodLabel, customRange, startDate, endDate, t, language,
}) => {
  if (!transactions?.length || !startDate || !endDate) return;
  const profileName = await getCurrentProfileName(currentUser);
  const { generatePeriodPDFReport } = await import("./pdfUtils.jsx");
  const label = periodLabel
    || (period === "custom" && customRange ? `${t("analytics.custom")} (${customRange.from} - ${customRange.to})` : period);
  const result = await generatePeriodPDFReport(
    transactions,
    startDate,
    endDate,
    label,
    language,
    profileName
  );
  return result.success;
};
