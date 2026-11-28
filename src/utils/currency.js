/**
 * Account currency.
 *
 * Every account keeps its money in one currency, stored in the synced
 * preferences (`preferences.currency`). Amounts are never converted: changing
 * the currency changes the unit, not the numbers.
 *
 * Amounts are always stored in hundredths of the major unit (`amountMinor`),
 * whatever the currency. Currencies without decimals (JPY, KRW, …) simply never
 * have a fractional part, and currencies with three decimals are kept to two.
 */

export const DEFAULT_CURRENCY = "EUR";

// ISO 4217 currencies in use. Their regions, used to pick a default for a new
// account, live in `currencyRegions.js`, loaded only when needed.
export const SUPPORTED_CURRENCIES = Object.freeze((
  "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD " +
  "CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD " +
  "GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD " +
  "KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO " +
  "NOK NPR NZD OMR PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS " +
  "SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF " +
  "XCD XCG XOF XPF YER ZAR ZMW"
).split(" "));

const SUPPORTED = new Set(SUPPORTED_CURRENCIES);

export const isSupportedCurrency = (code) => typeof code === "string" && SUPPORTED.has(code);

const digitsCache = new Map();

/** Decimal places shown and accepted: the currency's own, at most two. */
export const currencyFractionDigits = (code) => {
  if (!isSupportedCurrency(code)) return 2;
  if (!digitsCache.has(code)) {
    let digits = 2;
    try {
      digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
    } catch {
      // Unknown to this engine: keep two decimals.
    }
    digitsCache.set(code, Math.min(2, Math.max(0, digits)));
  }
  return digitsCache.get(code);
};

/** The short symbol shown next to amounts ("€", "$", "¥", "CHF"). */
export const currencySymbol = (code, locale = "en") => {
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value || code;
  } catch {
    return code;
  }
};

// The active account's currency. The planning layer keeps it in step with the
// synced preferences; formatting and new records read it from here, the same
// way the money formatting reads the active language.
let accountCurrency = DEFAULT_CURRENCY;
const listeners = new Set();

export const getAccountCurrency = () => accountCurrency;

/** Updates the value without notifying: safe while React renders. */
export const syncAccountCurrency = (code) => {
  const next = isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
  const changed = next !== accountCurrency;
  accountCurrency = next;
  return changed;
};

/** Tells the subscribed components to render with the current value. */
export const notifyAccountCurrency = () => {
  for (const listener of [...listeners]) listener();
};

export const setAccountCurrency = (code) => {
  if (syncAccountCurrency(code)) notifyAccountCurrency();
};

export const subscribeAccountCurrency = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Decimal places accepted for the active account. */
export const accountFractionDigits = () => currencyFractionDigits(accountCurrency);
