import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rules: [],
  updateRecurring: vi.fn(async () => true),
  deleteRecurring: vi.fn(async () => true),
  skipOccurrence: vi.fn(async () => true),
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  hapticSuccess: vi.fn(async () => true),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "it" } }),
}));
vi.mock("../src/context/PlanningProvider.jsx", () => ({
  usePlanning: () => ({
    recurring: mocks.rules,
    ready: true,
    updateRecurring: mocks.updateRecurring,
    deleteRecurring: mocks.deleteRecurring,
    skipOccurrence: mocks.skipOccurrence,
  }),
}));
vi.mock("../src/context/AddTransactionContext.jsx", () => ({
  useAddTransaction: () => ({ openAddTransaction: vi.fn(), canAdd: true }),
}));
vi.mock("../src/utils/categories.jsx", () => ({
  useCategories: () => ({
    expenseCategories: [
      { value: "casa", label: "Casa" },
      { value: "abbonamenti", label: "Abbonamenti" },
    ],
    incomeCategories: [{ value: "stipendio", label: "Stipendio" }],
  }),
}));
vi.mock("../src/utils/notificationUtils.jsx", () => ({
  useNotification: () => mocks.notification,
}));
vi.mock("../src/platform/haptics.js", () => ({
  hapticSuccess: mocks.hapticSuccess,
  hapticTap: vi.fn(async () => true),
}));
vi.mock("../src/components/Planning/BackButton.jsx", () => ({ default: () => null }));
vi.mock("../src/components/Planning/UpcomingList.jsx", () => ({ default: () => null }));

import RecurringPage from "../src/components/Planning/RecurringPage.jsx";
import { nextOccurrence, reanchorForFrequency } from "../src/utils/recurrence.js";

const sampleRule = {
  id: "rule-1",
  type: "expense",
  amountMinor: 1599,
  currency: "EUR",
  description: "Netflix",
  category: "abbonamenti",
  frequency: "monthly",
  anchorDateKey: "2026-01-10",
  nextIndex: 3,
  mode: "auto",
  paused: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rules = [sampleRule];
  mocks.updateRecurring.mockResolvedValue(true);
});

afterEach(cleanup);

describe("reanchorForFrequency", () => {
  it("preserves the next occurrence date when changing frequency without lowering nextIndex", () => {
    const expectedNext = nextOccurrence(sampleRule).dateKey; // 2026-04-10
    const yearlyAnchor = reanchorForFrequency(sampleRule, "yearly");
    expect(yearlyAnchor).toBe("2023-04-10");
    expect(nextOccurrence({ ...sampleRule, frequency: "yearly", anchorDateKey: yearlyAnchor }).dateKey).toBe(expectedNext);

    const weeklyAnchor = reanchorForFrequency(sampleRule, "weekly");
    expect(nextOccurrence({ ...sampleRule, frequency: "weekly", anchorDateKey: weeklyAnchor }).dateKey).toBe(expectedNext);
  });

  it("returns null when shifting would fall before 1970", () => {
    const oldRule = { ...sampleRule, nextIndex: 100 };
    expect(reanchorForFrequency(oldRule, "yearly")).toBeNull();
  });
});

describe("RecurringPage editing", () => {
  it("edits description, amount, category, frequency and mode of an existing rule", async () => {
    render(<RecurringPage />);
    fireEvent.click(screen.getByRole("button", { name: /Netflix/ }));

    const actionsDialog = await screen.findByRole("dialog");
    fireEvent.click(within(actionsDialog).getByRole("button", { name: "recurring.edit" }));

    const editSheet = await screen.findByRole("dialog");
    fireEvent.change(within(editSheet).getByLabelText("transactionModal.description"), { target: { value: "Netflix 4K" } });
    fireEvent.change(within(editSheet).getByLabelText("transaction.amount"), { target: { value: "19,99" } });
    fireEvent.click(within(editSheet).getByRole("radio", { name: "Casa" }));
    fireEvent.click(within(editSheet).getByRole("radio", { name: "recurring.frequency.yearly" }));
    fireEvent.click(within(editSheet).getByRole("radio", { name: "recurring.mode.confirm" }));

    fireEvent.click(within(editSheet).getByRole("button", { name: "save" }));

    await waitFor(() => expect(mocks.updateRecurring).toHaveBeenCalledWith("rule-1", {
      description: "Netflix 4K",
      amountMinor: 1999,
      category: "casa",
      mode: "confirm",
      frequency: "yearly",
      anchorDateKey: "2023-04-10",
    }));
    expect(mocks.hapticSuccess).toHaveBeenCalledOnce();
    expect(mocks.notification.success).toHaveBeenCalledWith("recurring.updated");
  });
});
