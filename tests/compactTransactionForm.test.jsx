import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compact: true,
  onSubmit: vi.fn().mockResolvedValue(true),
  t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
}));

vi.mock("react-responsive", () => ({ useMediaQuery: () => mocks.compact }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { language: "en" } }) }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock("../src/utils/categories.jsx", () => {
  const expense = [
    { value: "supermercato", label: "Groceries" },
    { value: "trasporti", label: "Transportation" },
  ];
  const income = [{ value: "stipendio", label: "Salary" }];
  return {
    useCategories: () => ({
      visibleExpenseCategories: expense,
      visibleIncomeCategories: income,
      expenseCategories: [...expense, { value: "viaggi", label: "Travel" }],
      incomeCategories: income,
    }),
  };
});
vi.mock("../src/context/PlanningProvider.jsx", () => ({
  usePlanning: () => ({ preferences: { defaultType: "expense", defaultCategory: "supermercato", quickAmounts: [5, 10] }, ready: true }),
}));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({
  useUnifiedTransactions: () => ({ transactions: [], isDemo: false, canAddMoreTransactions: true }),
}));
vi.mock("../src/platform/haptics.js", () => ({ hapticSuccess: vi.fn(), hapticTap: vi.fn() }));

import TransactionForm from "../src/components/Transaction/TransactionForm.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compact = true;
});
afterEach(() => cleanup());

describe("transaction form category picker", () => {
  it("picks the category from a sheet and saves it", async () => {
    render(<TransactionForm onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "Groceries" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "transactionModal.category: Groceries" }));
    expect(screen.getByRole("dialog", { name: "transactionModal.selectCategory" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Groceries", pressed: true })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Travel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Transportation", pressed: false }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "transactionModal.category: Transportation" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("transactionModal.amount"), { target: { value: "12.50" } });
    fireEvent.submit(document.querySelector("form"));

    await waitFor(() => expect(mocks.onSubmit).toHaveBeenCalled());
    expect(mocks.onSubmit.mock.calls[0][0]).toMatchObject({ category: "trasporti", type: "expense" });
  });

  it("never masks the amount being typed in privacy mode", () => {
    render(<TransactionForm onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    const amount = screen.getByLabelText("transactionModal.amount");
    // Privacy mode blurs `.amount` and `[data-amount]`; the input uses neither.
    expect(amount).not.toHaveClass("amount");
    expect(amount.closest("[data-amount]")).toBeNull();
  });

  it("keeps the category grid on wider screens", () => {
    mocks.compact = false;
    render(<TransactionForm onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Groceries" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "transactionModal.category: Groceries" })).toBeNull();
  });

  it("keeps a hidden category available when editing a transaction that uses it", () => {
    const transaction = { id: "trip", type: "expense", amount: 18, description: "Trip", category: "viaggi", dateKey: "2026-11-28" };
    render(<TransactionForm transaction={transaction} onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "transactionModal.category: Travel" }));
    expect(screen.getByRole("button", { name: "Travel", pressed: true })).toBeVisible();
  });
});
