export const DEFAULT_CURRENCY = "EUR";

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

export const MAX_AMOUNT_MINOR = 100_000_000;

export const parseMoneyToMinor = (value, { allowZero = false } = {}) => {
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new MoneyError("money.decimals", "Amount must have at most two decimal places");
    }
    value = Number(normalized);
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
  return parseMoneyToMinor(transaction?.amount, { allowZero: true });
};

export const sumTransactionsMinor = (transactions) =>
  transactions.reduce((total, transaction) => total + getTransactionAmountMinor(transaction), 0);
