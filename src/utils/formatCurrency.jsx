import { currencyFractionDigits, getAccountCurrency } from "./currency.js";

/**
 * Formats an amount in the active account currency. Extra arguments that are
 * not strings are ignored, so the function is safe to pass straight to
 * `Array.prototype.map`.
 *
 * The active app language drives the default locale; `i18n.jsx` keeps it in
 * step. The planning layer keeps the account currency in step with the synced
 * preferences. Callers that format in a specific language (PDF reports) can
 * pass a locale explicitly.
 */
let currentLanguage = "it";

/** Called by the i18n setup whenever the interface language changes. */
export const setMoneyLanguage = (language) => {
  currentLanguage = language || "it";
};

/** "it" → it-IT, "en" → en-GB (symbol before the amount, dot decimals). */
export const moneyLocale = (language = currentLanguage) => (
  String(language || "").toLowerCase().startsWith("en") ? "en-GB" : "it-IT"
);

const toNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const currencyOf = (currency) => (typeof currency === "string" ? currency : getAccountCurrency());

const formatWith = (value, locale, currency, fractionDigits, currencyDisplay = "narrowSymbol") => toNumber(value).toLocaleString(locale, {
  style: "currency",
  currency,
  // "$" rather than "US$": an account has a single currency, so the short
  // symbol is never ambiguous.
  currencyDisplay,
  minimumFractionDigits: fractionDigits,
  maximumFractionDigits: fractionDigits,
  // Italian locale data skips the separator for 4-digit numbers ("7444,00 €").
  useGrouping: "always",
});

const formatCurrency = (value, locale, currency) => {
  const code = currencyOf(currency);
  return formatWith(
    value,
    typeof locale === "string" ? locale : moneyLocale(),
    code,
    currencyFractionDigits(code)
  );
};

/**
 * Drops the cents when the amount is a whole number, so chips and summaries
 * read "10 €" instead of "10,00 €" in every language.
 */
export const formatCompactCurrency = (value, language, currency) => {
  const code = currencyOf(currency);
  return formatWith(
    value,
    moneyLocale(language),
    code,
    Number.isInteger(toNumber(value)) ? 0 : currencyFractionDigits(code)
  );
};

/** "INR 1,234.50": the ISO code instead of the symbol, for output that cannot draw every symbol. */
export const formatCurrencyCode = (value, locale, currency) => {
  const code = currencyOf(currency);
  return formatWith(value, typeof locale === "string" ? locale : moneyLocale(), code, currencyFractionDigits(code), "code");
};

export default formatCurrency;

/** "+2.500,00 €" for income, "−50,00 €" (true minus sign) for expenses. */
export const formatSignedAmount = (amount, type, language) =>
  `${type === "income" ? "+" : "−"}${formatCurrency(Math.abs(amount), moneyLocale(language))}`;

/** Same as `formatSignedAmount`, without cents on whole amounts. */
export const formatSignedCompact = (amount, type, language) =>
  `${type === "income" ? "+" : "−"}${formatCompactCurrency(Math.abs(amount), language)}`;
