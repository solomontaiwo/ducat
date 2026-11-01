/**
 * Formats an amount in euro. Extra arguments that are not strings are ignored,
 * so the function is safe to pass straight to `Array.prototype.map`.
 *
 * The active app language drives the default locale; `i18n.jsx` keeps it in
 * step. Callers that format in a specific language (PDF reports) can pass a
 * locale explicitly.
 */
let currentLanguage = "it";

/** Called by the i18n setup whenever the interface language changes. */
export const setMoneyLanguage = (language) => {
  currentLanguage = language || "it";
};

/** "it" → it-IT, "en" → en-GB (euro before the amount, dot decimals). */
export const moneyLocale = (language = currentLanguage) => (
  String(language || "").toLowerCase().startsWith("en") ? "en-GB" : "it-IT"
);

const toNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const formatWith = (value, locale, currency, fractionDigits) => toNumber(value).toLocaleString(locale, {
  style: "currency",
  currency: typeof currency === "string" ? currency : "EUR",
  minimumFractionDigits: fractionDigits,
  maximumFractionDigits: fractionDigits,
  // Italian locale data skips the separator for 4-digit numbers ("7444,00 €").
  useGrouping: "always",
});

const formatCurrency = (value, locale, currency) => formatWith(
  value,
  typeof locale === "string" ? locale : moneyLocale(),
  currency,
  2
);

/**
 * Drops the cents when the amount is a whole number, so chips and summaries
 * read "10 €" instead of "10,00 €" in every language.
 */
export const formatCompactCurrency = (value, language) => formatWith(
  value,
  moneyLocale(language),
  "EUR",
  Number.isInteger(toNumber(value)) ? 0 : 2
);

export default formatCurrency;

/** "+2.500,00 €" for income, "−50,00 €" (true minus sign) for expenses. */
export const formatSignedAmount = (amount, type, language) =>
  `${type === "income" ? "+" : "−"}${formatCurrency(Math.abs(amount), moneyLocale(language))}`;

/** Same as `formatSignedAmount`, without cents on whole amounts. */
export const formatSignedCompact = (amount, type, language) =>
  `${type === "income" ? "+" : "−"}${formatCompactCurrency(Math.abs(amount), language)}`;
