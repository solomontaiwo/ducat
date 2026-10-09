const formatCurrency = (value, locale = "it-IT", currency = "EUR") =>
  value.toLocaleString(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default formatCurrency;

/** "+2.500,00 €" for income, "−50,00 €" (true minus sign) for expenses. */
export const formatSignedAmount = (amount, type) =>
  `${type === "income" ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
