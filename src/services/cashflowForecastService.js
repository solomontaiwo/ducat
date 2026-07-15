const frequencyDays = {
  weekly: 7,
  biweekly: 14,
};

const startOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const dateKey = (date) => date.toISOString().slice(0, 10);

const addMonths = (date, amount) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};

const nextOccurrence = (date, frequency) =>
  frequency === "monthly"
    ? addMonths(date, 1)
    : new Date(date.getFullYear(), date.getMonth(), date.getDate() + frequencyDays[frequency]);

export const getCurrentBalance = (transactions, openingBalance = 0) =>
  transactions.reduce(
    (balance, transaction) =>
      balance + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount)),
    Number(openingBalance) || 0
  );

export const buildCashflowForecast = ({ rules, currentBalance, startDate = new Date(), days = 60 }) => {
  const start = startOfDay(startDate);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
  const eventsByDate = new Map();

  rules.filter((rule) => rule.active).forEach((rule) => {
    let occurrence = startOfDay(rule.nextDueDate);
    while (occurrence < start) occurrence = nextOccurrence(occurrence, rule.frequency);

    while (occurrence <= end) {
      const key = dateKey(occurrence);
      const event = {
        ruleId: rule.id,
        date: new Date(occurrence),
        type: rule.type,
        amount: Number(rule.amount),
        description: rule.description,
        category: rule.category,
      };
      eventsByDate.set(key, [...(eventsByDate.get(key) || []), event]);
      occurrence = nextOccurrence(occurrence, rule.frequency);
    }
  });

  let balance = Number(currentBalance) || 0;
  const timeline = Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const events = eventsByDate.get(dateKey(date)) || [];
    const netChange = events.reduce(
      (total, event) => total + (event.type === "income" ? event.amount : -event.amount),
      0
    );
    balance += netChange;
    return { date, balance: Number(balance.toFixed(2)), netChange: Number(netChange.toFixed(2)), events };
  });

  return { timeline, upcomingEvents: timeline.flatMap((day) => day.events), endingBalance: balance };
};
