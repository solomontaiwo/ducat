import assert from "node:assert/strict";
import test from "node:test";
import { buildCashflowForecast, getCurrentBalance } from "../src/services/cashflowForecastService.js";
import { getBudgetPeriodRange, isInBudgetPeriod } from "../src/utils/budgetPeriod.js";

test("calculates the current balance from an opening balance and transactions", () => {
  const balance = getCurrentBalance([
    { type: "income", amount: 200 },
    { type: "expense", amount: 75.5 },
  ], 50);
  assert.equal(balance, 174.5);
});

test("projects recurring weekly, biweekly and monthly events", () => {
  const { timeline, upcomingEvents, endingBalance } = buildCashflowForecast({
    currentBalance: 100,
    startDate: new Date(2026, 0, 1),
    days: 32,
    rules: [
      { id: "salary", type: "income", amount: 1000, description: "Salary", category: "stipendio", frequency: "monthly", nextDueDate: new Date(2026, 0, 31), active: true },
      { id: "rent", type: "expense", amount: 600, description: "Rent", category: "casa", frequency: "monthly", nextDueDate: new Date(2026, 0, 5), active: true },
      { id: "gym", type: "expense", amount: 10, description: "Gym", category: "salute", frequency: "weekly", nextDueDate: new Date(2026, 0, 1), active: true },
    ],
  });

  assert.equal(upcomingEvents.length, 7);
  assert.equal(timeline[0].balance, 90);
  assert.equal(endingBalance, 450);
});

test("uses the selected budget period instead of always using the current month", () => {
  const now = new Date(2026, 6, 15, 12);
  const weekly = getBudgetPeriodRange("weekly", now);
  const yearly = getBudgetPeriodRange("yearly", now);

  assert.equal(weekly.start.getDate(), 13);
  assert.equal(yearly.start.getMonth(), 0);
  assert.equal(isInBudgetPeriod(new Date(2026, 6, 14), "weekly", now), true);
  assert.equal(isInBudgetPeriod(new Date(2026, 6, 6), "weekly", now), false);
  assert.equal(isInBudgetPeriod(new Date(2026, 0, 10), "yearly", now), true);
});
