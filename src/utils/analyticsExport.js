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

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportAnalyticsCsv = async ({ transactions, currentUser, period, startDate, endDate }) => {
  if (!transactions?.length) return;
  const blob = new Blob([buildAnalyticsCsv(transactions)], { type: "text/csv;charset=utf-8;" });
  const profileName = await getCurrentProfileName(currentUser);
  triggerDownload(blob, generateExportFileName(period, startDate, endDate, profileName, "csv"));
};

export const exportAnalyticsPdf = async ({ transactions, currentUser, period, customRange, startDate, endDate, t, language }) => {
  if (!transactions?.length || !startDate || !endDate) return;
  const profileName = await getCurrentProfileName(currentUser);
  const { generatePeriodPDFReport } = await import("./pdfUtils.jsx");
  await generatePeriodPDFReport(
    transactions,
    startDate,
    endDate,
    period === "custom" ? `${t("analytics.custom")} (${customRange.from} - ${customRange.to})` : period,
    language,
    profileName
  );
};
