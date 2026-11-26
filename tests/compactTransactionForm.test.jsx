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
      expenseCategories: expense,
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

describe("transaction form on short phone screens", () => {
  it("picks the category from a menu and saves it", async () => {
    render(<TransactionForm onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "Groceries" })).toBeNull();
    const menu = screen.getByRole("combobox", { name: "transactionModal.category" });
    expect(menu).toHaveValue("supermercato");

    fireEvent.change(menu, { target: { value: "trasporti" } });
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

  it("keeps the category chips on taller screens", () => {
    mocks.compact = false;
    render(<TransactionForm onSubmit={mocks.onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Groceries" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("combobox", { name: "transactionModal.category" })).toBeNull();
  });
});
