export const DATE_KEY_FORMAT = "yyyy-MM-dd";

// Plain local-calendar formatting: date-fns' parse/format would pull their
// whole parser into the initial bundle just for `yyyy-MM-dd`.
const pad = (value, length = 2) => String(value).padStart(length, "0");
const localDateKey = (date) => `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const isDateKey = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const dateKeyToDate = (dateKey) => {
  if (!isDateKey(dateKey)) throw new Error("Data giorno non valida");
  const [year, month, day] = dateKey.split("-").map(Number);
  // setFullYear, not the constructor: new Date(50, …) would mean 1950.
  const parsed = new Date(2000, 0, 1, 12, 0, 0, 0);
  parsed.setFullYear(year, month - 1, day);
  if (Number.isNaN(parsed.getTime()) || localDateKey(parsed) !== dateKey) {
    throw new Error("Data giorno non valida");
  }
  return parsed;
};

export const dateKeyToUtcDate = (dateKey) => {
  if (!isDateKey(dateKey)) throw new Error("Data giorno non valida");
  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) throw new Error("Data giorno non valida");
  return result;
};

export const dateToDateKey = (input) => {
  const date = input?.toDate?.() || (input instanceof Date ? input : new Date(input));
  if (Number.isNaN(date.getTime())) throw new Error("Data non valida");

  // Legacy form values were stored as midnight UTC through new Date('YYYY-MM-DD').
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
  }
  return localDateKey(date);
};

export const coerceDateKey = (value) => isDateKey(value) ? value : dateToDateKey(value);
export const todayDateKey = () => localDateKey(new Date());
