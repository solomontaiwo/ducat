export const DEFAULT_CURRENCY = "EUR";
export const MAX_AMOUNT_MINOR = 100_000_000;

export const parseMoneyToMinor = (value, { allowZero = false } = {}) => {
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error("L'importo deve avere al massimo due cifre decimali");
    }
    value = Number(normalized);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("L'importo deve essere un numero finito");
  }

  const amountMinor = Math.round((value + Number.EPSILON) * 100);
  if (amountMinor < 0 || (!allowZero && amountMinor === 0)) {
    throw new Error("L'importo deve essere maggiore di zero");
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_AMOUNT_MINOR) {
    throw new Error("L'importo supera il massimo consentito");
  }
  return amountMinor;
};

export const minorToMajor = (amountMinor) => {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Importo in centesimi non valido");
  return amountMinor / 100;
};

export const getTransactionAmountMinor = (transaction) => {
  if (Number.isSafeInteger(transaction?.amountMinor)) return transaction.amountMinor;
  return parseMoneyToMinor(transaction?.amount, { allowZero: true });
};

export const sumTransactionsMinor = (transactions) =>
  transactions.reduce((total, transaction) => total + getTransactionAmountMinor(transaction), 0);
