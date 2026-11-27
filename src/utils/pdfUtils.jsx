import JsPDF from "jspdf";
import { saveFile } from "./saveFile.js";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import i18n from "./i18n.jsx";
import formatCurrency, { moneyLocale } from "./formatCurrency.jsx";
import { generateExportFileName, getCurrentProfileName } from "./downloadUtils.jsx";
import { buildReportModel } from "./reportModel.js";
import { APP_NAME } from "./brand.js";

const getPdfStrings = (lang = "it") => ({
  reportTitle: i18n.t("pdf.reportTitle", { lng: lang }),
  generatedOn: i18n.t("pdf.generatedOn", { lng: lang }),
  periodLabel: i18n.t("pdf.period", { lng: lang }),
  summaryTitle: i18n.t("pdf.summaryTitle", { lng: lang }),
  totalIncome: i18n.t("pdf.totalIncome", { lng: lang }),
  totalExpense: i18n.t("pdf.totalExpense", { lng: lang }),
  balance: i18n.t("pdf.balance", { lng: lang }),
  avgDailyIncome: i18n.t("pdf.avgDailyIncome", { lng: lang }),
  avgDailyExpense: i18n.t("pdf.avgDailyExpense", { lng: lang }),
  expenseDistribution: i18n.t("pdf.expenseDistribution", { lng: lang }),
  topExpenses: i18n.t("pdf.topExpenses", { lng: lang }),
  topIncomes: i18n.t("pdf.topIncomes", { lng: lang }),
  fullList: i18n.t("pdf.fullList", { lng: lang }),
  noTransactions: i18n.t("pdf.noTransactions", { lng: lang }),
  date: i18n.t("pdf.date", { lng: lang }),
  type: i18n.t("pdf.type", { lng: lang }),
  description: i18n.t("pdf.description", { lng: lang }),
  category: i18n.t("pdf.category", { lng: lang }),
  amount: i18n.t("pdf.amount", { lng: lang }),
  average: i18n.t("pdf.average", { lng: lang }),
  income: i18n.t("pdf.income", { lng: lang }),
  expense: i18n.t("pdf.expense", { lng: lang }),
});

const categoryLabel = (category, lang) => i18n.t(`categories.${category}`, { lng: lang, defaultValue: category });

/** Replaces glyphs that jsPDF's built-in Helvetica font cannot encode (e.g. emoji). */
const pdfSafeText = (value) => String(value ?? "")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/\u2212/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[^\x20-\x7E\xA0-\xFF\u20AC]/g, "")
  .replace(/\s+/g, " ")
  .trim();

/** Starts a fresh page when the remaining height cannot fit a section title and its first rows. */
const nextSectionY = (doc, neededMm = 36) => {
  const current = (doc.lastAutoTable?.finalY ?? 48) + 10;
  const limit = doc.internal.pageSize.height - 18;
  if (current + neededMm > limit) {
    doc.addPage();
    return 18;
  }
  return current;
};

const addFooter = (doc) => {
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${APP_NAME} · ${page}/${pages}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 8, { align: "center" });
  }
};

export const createPDFReport = ({ transactions, startDate, endDate, periodLabel, lang = "it" }) => {
  const strings = getPdfStrings(lang);
  const locale = lang?.startsWith("en") ? enUS : it;
  const currencyLocale = moneyLocale(lang);
  const model = buildReportModel(transactions, startDate, endDate);
  const doc = new JsPDF();

  doc.setFontSize(20);
  doc.setTextColor(51, 65, 85);
  doc.text(pdfSafeText(strings.reportTitle), 20, 20);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${pdfSafeText(strings.periodLabel)}: ${pdfSafeText(periodLabel)}`, 20, 29);
  doc.text(`${format(model.startDate, "dd/MM/yyyy", { locale })} - ${format(model.endDate, "dd/MM/yyyy", { locale })}`, 20, 35);
  doc.text(`${pdfSafeText(strings.generatedOn)}: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale })}`, 20, 41);

  autoTable(doc, {
    startY: 48,
    margin: { bottom: 18 },
    head: [[strings.totalIncome, strings.totalExpense, strings.balance, strings.avgDailyIncome, strings.avgDailyExpense]],
    body: [[model.totalIncome, model.totalExpense, model.balance, model.avgDailyIncome, model.avgDailyExpense].map((value) => formatCurrency(value, currencyLocale))],
    styles: { fontSize: 8 },
  });

  if (!model.transactions.length) {
    doc.text(pdfSafeText(strings.noTransactions), 20, nextSectionY(doc, 16));
    addFooter(doc);
    return { doc, model };
  }

  const distY = nextSectionY(doc, 40);
  doc.text(pdfSafeText(strings.expenseDistribution), 14, distY);
  autoTable(doc, {
    startY: distY + 4,
    margin: { bottom: 18 },
    head: [[strings.category, "%", strings.amount, strings.average]],
    body: model.categoryBreakdown.map((entry) => [
      pdfSafeText(categoryLabel(entry.category, lang)),
      `${entry.percentage.toFixed(2)}%`,
      formatCurrency(entry.amount, currencyLocale),
      formatCurrency(entry.average, currencyLocale),
    ]),
  });

  const movementRows = (items) => items.map((transaction) => [
    format(transaction.date, "dd/MM/yyyy", { locale }),
    pdfSafeText(transaction.description),
    pdfSafeText(categoryLabel(transaction.category, lang)),
    formatCurrency(transaction.amount, currencyLocale),
  ]);

  const topExpY = nextSectionY(doc, 38);
  doc.text(pdfSafeText(strings.topExpenses), 14, topExpY);
  autoTable(doc, {
    startY: topExpY + 4,
    margin: { bottom: 18 },
    head: [[strings.date, strings.description, strings.category, strings.amount]],
    body: movementRows(model.topExpenses),
  });

  const topIncY = nextSectionY(doc, 38);
  doc.text(pdfSafeText(strings.topIncomes), 14, topIncY);
  autoTable(doc, {
    startY: topIncY + 4,
    margin: { bottom: 18 },
    head: [[strings.date, strings.description, strings.category, strings.amount]],
    body: movementRows(model.topIncomes),
  });

  doc.addPage();
  doc.text(pdfSafeText(strings.fullList), 14, 18);
  autoTable(doc, {
    startY: 23,
    margin: { bottom: 18 },
    head: [[strings.date, strings.type, strings.description, strings.category, strings.amount]],
    body: model.transactions.map((transaction) => [
      format(transaction.date, "dd/MM/yyyy", { locale }),
      transaction.type === "income" ? strings.income : strings.expense,
      pdfSafeText(transaction.description),
      pdfSafeText(categoryLabel(transaction.category, lang)),
      formatCurrency(transaction.amount, currencyLocale),
    ]),
    showHead: "everyPage",
  });
  addFooter(doc);
  return { doc, model };
};

export const generatePeriodPDFReport = async (
  transactions = [],
  startDate,
  endDate,
  periodLabel = "custom",
  lang = "it",
  user = "user"
) => {
  const profileName = await getCurrentProfileName(user);
  const { doc, model } = createPDFReport({ transactions, startDate, endDate, periodLabel, lang });
  const filename = generateExportFileName(periodLabel, startDate, endDate, profileName, "pdf");
  // One path for every shell, as for CSV: a download link on the web, a save
  // dialog on desktop and the share sheet on iOS. jsPDF's own save() fakes a
  // link download, which the iOS WebView silently ignores.
  const saved = await saveFile(doc.output("blob"), filename);
  return { success: saved !== false, filename, transactionCount: model.transactionCount };
};
