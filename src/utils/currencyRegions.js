/**
 * Currencies by region (ISO 3166), to start a new account with the currency
 * of the device, and how currencies are named and written. Kept apart from
 * `currency.js` so the initial bundle carries only what formatting needs.
 */
import { DEFAULT_CURRENCY } from "./currency.js";

// ISO 4217 currencies in use, each with the regions (ISO 3166) that use it.
export const CURRENCY_REGIONS = {
  AED: "AE", AFN: "AF", ALL: "AL", AMD: "AM", AOA: "AO", ARS: "AR",
  AUD: "AU CC CX HM KI NF NR TV", AWG: "AW", AZN: "AZ", BAM: "BA", BBD: "BB",
  BDT: "BD", BHD: "BH", BIF: "BI", BMD: "BM", BND: "BN", BOB: "BO", BRL: "BR",
  BSD: "BS", BTN: "BT", BWP: "BW", BYN: "BY", BZD: "BZ", CAD: "CA", CDF: "CD",
  CHF: "CH LI", CLP: "CL", CNY: "CN", COP: "CO", CRC: "CR", CUP: "CU", CVE: "CV",
  CZK: "CZ", DJF: "DJ", DKK: "DK FO GL", DOP: "DO", DZD: "DZ", EGP: "EG",
  ERN: "ER", ETB: "ET",
  EUR: "AD AT AX BE BG BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM TF VA XK YT",
  FJD: "FJ", FKP: "FK", GBP: "GB GG IM JE", GEL: "GE", GHS: "GH", GIP: "GI",
  GMD: "GM", GNF: "GN", GTQ: "GT", GYD: "GY", HKD: "HK", HNL: "HN", HTG: "HT",
  HUF: "HU", IDR: "ID", ILS: "IL PS", INR: "IN", IQD: "IQ", IRR: "IR", ISK: "IS",
  JMD: "JM", JOD: "JO", JPY: "JP", KES: "KE", KGS: "KG", KHR: "KH", KMF: "KM",
  KPW: "KP", KRW: "KR", KWD: "KW", KYD: "KY", KZT: "KZ", LAK: "LA", LBP: "LB",
  LKR: "LK", LRD: "LR", LSL: "LS", LYD: "LY", MAD: "MA EH", MDL: "MD", MGA: "MG",
  MKD: "MK", MMK: "MM", MNT: "MN", MOP: "MO", MRU: "MR", MUR: "MU", MVR: "MV",
  MWK: "MW", MXN: "MX", MYR: "MY", MZN: "MZ", NAD: "NA", NGN: "NG", NIO: "NI",
  NOK: "NO SJ BV", NPR: "NP", NZD: "NZ CK NU PN TK", OMR: "OM", PEN: "PE",
  PGK: "PG", PHP: "PH", PKR: "PK", PLN: "PL", PYG: "PY", QAR: "QA", RON: "RO",
  RSD: "RS", RUB: "RU", RWF: "RW", SAR: "SA", SBD: "SB", SCR: "SC", SDG: "SD",
  SEK: "SE", SGD: "SG", SHP: "SH", SLE: "SL", SOS: "SO", SRD: "SR", SSP: "SS",
  STN: "ST", SYP: "SY", SZL: "SZ", THB: "TH", TJS: "TJ", TMT: "TM", TND: "TN",
  TOP: "TO", TRY: "TR", TTD: "TT", TWD: "TW", TZS: "TZ", UAH: "UA", UGX: "UG",
  USD: "US AS BQ EC FM GU IO MH MP PA PR PW SV TC TL UM VG VI ZW", UYU: "UY",
  UZS: "UZ", VES: "VE", VND: "VN", VUV: "VU", WST: "WS",
  XAF: "CM CF TD CG GQ GA", XCD: "AG AI DM GD KN LC MS VC", XCG: "CW SX",
  XOF: "BJ BF CI GW ML NE SN TG", XPF: "PF NC WF", YER: "YE", ZAR: "ZA", ZMW: "ZM",
};

const CURRENCY_BY_REGION = new Map(
  Object.entries(CURRENCY_REGIONS).flatMap(([code, regions]) => regions.split(" ").map((region) => [region, code]))
);

/** The currency used in a region (ISO 3166 alpha-2), or null. */
export const currencyForRegion = (region) => CURRENCY_BY_REGION.get(String(region || "").toUpperCase()) || null;

const regionOf = (tag, maximize) => {
  try {
    const locale = new Intl.Locale(tag);
    return (maximize ? locale.maximize() : locale).region || null;
  } catch {
    return null;
  }
};

/**
 * The currency of the device region, from the preferred languages: an explicit
 * region wins ("en-GB" → GBP), then the likely one ("ja" → JP → JPY).
 */
export const deviceCurrency = (languages = typeof navigator === "undefined" ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language])) => {
  const tags = (languages || []).filter((tag) => typeof tag === "string" && tag);
  for (const maximize of [false, true]) {
    for (const tag of tags) {
      const currency = currencyForRegion(regionOf(tag, maximize));
      if (currency) return currency;
    }
  }
  return DEFAULT_CURRENCY;
};

/** Every way an amount in this currency can be written: "$", "US$", "USD", … */
export const currencyTokens = (code) => {
  const tokens = new Set([code]);
  for (const locale of ["en", "en-US", "en-GB", "it"]) {
    for (const currencyDisplay of ["narrowSymbol", "symbol"]) {
      try {
        const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay }).formatToParts(0);
        const value = parts.find((part) => part.type === "currency")?.value;
        if (value) tokens.add(value);
      } catch {
        // Ignore.
      }
    }
  }
  if (code === "EUR") tokens.add("EURO");
  return [...tokens].sort((first, second) => second.length - first.length);
};

const displayNames = new Map();

/** Localized currency name ("Euro", "Dollaro statunitense"), the code if unknown. */
export const currencyName = (code, language = "en") => {
  try {
    if (!displayNames.has(language)) displayNames.set(language, new Intl.DisplayNames([language], { type: "currency" }));
    const name = displayNames.get(language).of(code);
    return name && name !== code ? name.charAt(0).toLocaleUpperCase(language) + name.slice(1) : code;
  } catch {
    return code;
  }
};
