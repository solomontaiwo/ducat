/**
 * Formats an amount in euro. Extra arguments that are not strings are ignored,
 * so the function is safe to pass straight to `Array.prototype.map`.
 */
const formatCurrency = (value, locale, currency) =>
  Number(value || 0).toLocaleString(typeof locale === "string" ? locale : "it-IT", {
    style: "currency",
    currency: typeof currency === "string" ? currency : "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Italian locale data skips the separator for 4-digit numbers ("7444,00 €").
    useGrouping: "always",
  });

export default formatCurrency;

/** "+2.500,00 €" for income, "−50,00 €" (true minus sign) for expenses. */
export const formatSignedAmount = (amount, type) =>
  `${type === "income" ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
