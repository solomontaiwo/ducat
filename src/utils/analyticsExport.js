import { saveFile } from "./saveFile.js";
import { serializeCsv } from "./csvUtils";
import { dateToDateKey } from "./dateUtils";
import { generateExportFileName, getCurrentProfileName } from "./downloadUtils.jsx";

const CSV_HEADERS = ["Data", "Tipo", "Descrizione", "Categoria", "Importo"];

export const buildAnalyticsCsv = (transactions) => serializeCsv(CSV_HEADERS, transactions.map((transaction) => [
  transaction.dateKey || dateToDateKey(transaction.date),
  transaction.type,
  transaction.description || "",
  transaction.category || "",
  transaction.amount.toFixed(2),
]));

export const exportAnalyticsCsv = async ({ transactions, currentUser, period, startDate, endDate }) => {
  if (!transactions?.length) return;
  const blob = new Blob([buildAnalyticsCsv(transactions)], { type: "text/csv;charset=utf-8;" });
  const profileName = await getCurrentProfileName(currentUser);
  return saveFile(blob, generateExportFileName(period, startDate, endDate, profileName, "csv"));
};

export const exportAnalyticsPdf = async ({ transactions, currentUser, period, customRange, startDate, endDate, t, language }) => {
  if (!transactions?.length || !startDate || !endDate) return;
  const profileName = await getCurrentProfileName(currentUser);
  const { generatePeriodPDFReport } = await import("./pdfUtils.jsx");
  const result = await generatePeriodPDFReport(
    transactions,
    startDate,
    endDate,
    period === "custom" ? `${t("analytics.custom")} (${customRange.from} - ${customRange.to})` : period,
    language,
    profileName
  );
  return result.success;
};
