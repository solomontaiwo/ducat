import { DEFAULT_CURRENCY, accountFractionDigits } from "./currency.js";

export { DEFAULT_CURRENCY };

/**
 * Validation failure with a stable `i18nKey`, so the UI can show it in the
 * active language while logs keep the original message.
 */
export class MoneyError extends Error {
  constructor(i18nKey, message) {
    super(message);
    this.name = "MoneyError";
    this.i18nKey = i18nKey;
  }
}

/**
 * Upper bound in minor units (hundredths), shared with the database. It leaves
 * room for currencies with a small unit (1 trillion yen, dong or rupiah).
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000;

/**
 * Parses an amount into minor units (hundredths of the major unit).
 * `maxDecimals` defaults to the active account currency: none for JPY,
 * two for EUR.
 */
export const parseMoneyToMinor = (value, { allowZero = false, maxDecimals = accountFractionDigits() } = {}) => {
  if (typeof value === "string") {
    // Accept both "1.234,56" and "1,234.56": the rightmost separator is the
    // decimal one, the other groups are thousands. Currency symbols are ignored.
    const normalized = value.trim().replace(/[\p{Sc}\s\u00a0\u202f]/gu, "");
    let cleaned;
    if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(normalized)) {
      const decimals = normalized.match(/[.,](\d{1,2})$/);
      const digits = normalized.replace(/[.,]/g, "");
      cleaned = decimals
        ? `${digits.slice(0, -decimals[1].length)}.${decimals[1]}`
        : digits;
    } else if (/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) {
      cleaned = normalized.replace(",", ".");
    } else {
      throw new MoneyError("money.decimals", "Amount must have at most two decimal places");
    }
    if (maxDecimals < 2 && !/^\d+(?:\.0+)?$/.test(cleaned)) {
      throw new MoneyError("money.noDecimals", "This currency has no decimal places");
    }
    value = Number(cleaned);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MoneyError("money.notFinite", "Amount must be a finite number");
  }

  const amountMinor = Math.round((value + Number.EPSILON) * 100);
  if (amountMinor < 0 || (!allowZero && amountMinor === 0)) {
    throw new MoneyError("money.notPositive", "Amount must be greater than zero");
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_AMOUNT_MINOR) {
    throw new MoneyError("money.tooLarge", "Amount exceeds the maximum allowed");
  }
  return amountMinor;
};

export const minorToMajor = (amountMinor) => {
  if (!Number.isSafeInteger(amountMinor)) throw new MoneyError("money.invalid", "Invalid amount in minor units");
  return amountMinor / 100;
};

export const getTransactionAmountMinor = (transaction) => {
  if (Number.isSafeInteger(transaction?.amountMinor)) return transaction.amountMinor;
  // Stored data predates the account currency: read it with two decimals.
  return parseMoneyToMinor(transaction?.amount, { allowZero: true, maxDecimals: 2 });
};
