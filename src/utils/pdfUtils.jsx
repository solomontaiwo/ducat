import JsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import i18n from "./i18n.jsx";
import formatCurrency from "./formatCurrency.jsx";
import { generateExportFileName, getCurrentProfileName } from "./downloadUtils.jsx";
import { buildReportModel } from "./reportModel.js";

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
  income: i18n.t("pdf.income", { lng: lang }),
  expense: i18n.t("pdf.expense", { lng: lang }),
});

const categoryLabel = (category, lang) => i18n.t(`categories.${category}`, { lng: lang, defaultValue: category });

const addFooter = (doc) => {
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`SoldiSotto · ${page}/${pages}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 8, { align: "center" });
  }
};

export const createPDFReport = ({ transactions, startDate, endDate, periodLabel, lang = "it" }) => {
  const strings = getPdfStrings(lang);
  const locale = lang?.startsWith("en") ? enUS : it;
  const model = buildReportModel(transactions, startDate, endDate);
  const doc = new JsPDF();

  doc.setFontSize(20);
  doc.setTextColor(51, 65, 85);
  doc.text(strings.reportTitle, 20, 20);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${strings.periodLabel}: ${periodLabel}`, 20, 29);
  doc.text(`${format(model.startDate, "dd/MM/yyyy", { locale })} – ${format(model.endDate, "dd/MM/yyyy", { locale })}`, 20, 35);
  doc.text(`${strings.generatedOn}: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale })}`, 20, 41);

  autoTable(doc, {
    startY: 48,
    head: [[strings.totalIncome, strings.totalExpense, strings.balance, strings.avgDailyIncome, strings.avgDailyExpense]],
    body: [[model.totalIncome, model.totalExpense, model.balance, model.avgDailyIncome, model.avgDailyExpense].map((value) => formatCurrency(value))],
    styles: { fontSize: 8 },
  });

  if (!model.transactions.length) {
    doc.text(strings.noTransactions, 20, doc.lastAutoTable.finalY + 15);
    addFooter(doc);
    return { doc, model };
  }

  doc.text(strings.expenseDistribution, 14, doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    head: [[strings.category, "%", strings.amount, "Media"]],
    body: model.categoryBreakdown.map((entry) => [
      categoryLabel(entry.category, lang),
      `${entry.percentage.toFixed(2)}%`,
      formatCurrency(entry.amount),
      formatCurrency(entry.average),
    ]),
  });

  const movementRows = (items) => items.map((transaction) => [
    format(transaction.date, "dd/MM/yyyy", { locale }),
    transaction.description,
    categoryLabel(transaction.category, lang),
    formatCurrency(transaction.amount),
  ]);

  doc.text(strings.topExpenses, 14, doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    head: [[strings.date, strings.description, strings.category, strings.amount]],
    body: movementRows(model.topExpenses),
  });

  doc.text(strings.topIncomes, 14, doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    head: [[strings.date, strings.description, strings.category, strings.amount]],
    body: movementRows(model.topIncomes),
  });

  doc.addPage();
  doc.text(strings.fullList, 14, 18);
  autoTable(doc, {
    startY: 23,
    head: [[strings.date, strings.type, strings.description, strings.category, strings.amount]],
    body: model.transactions.map((transaction) => [
      format(transaction.date, "dd/MM/yyyy", { locale }),
      transaction.type === "income" ? strings.income : strings.expense,
      transaction.description,
      categoryLabel(transaction.category, lang),
      formatCurrency(transaction.amount),
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
  doc.save(filename);
  return { success: true, filename, transactionCount: model.transactionCount };
};
