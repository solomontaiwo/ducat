import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateAmountExpression,
  formatEvaluatedAmount,
  hasAmountExpression,
  sanitizeAmountInput,
} from "../src/utils/amountExpression.js";
import { setAccountCurrency } from "../src/utils/currency.js";

const mocks = vi.hoisted(() => ({
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  addTransaction: vi.fn().mockResolvedValue(true),
  t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }),
}));
vi.mock("../src/utils/notificationUtils.jsx", () => ({
  useNotification: () => mocks.notification,
}));
vi.mock("../src/utils/categories.jsx", () => ({
  useCategories: () => ({
    visibleExpenseCategories: [{ value: "alimentazione", label: "Ristoranti e bar" }],
    visibleIncomeCategories: [{ value: "stipendio", label: "Stipendio" }],
    expenseCategories: [{ value: "alimentazione", label: "Ristoranti e bar" }],
    incomeCategories: [{ value: "stipendio", label: "Stipendio" }],
  }),
}));
vi.mock("../src/context/PlanningProvider.jsx", () => ({
  usePlanning: () => ({
    preferences: { defaultType: "expense", defaultCategory: "alimentazione", quickAmounts: [5, 10, 20] },
    ready: true,
  }),
}));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({
  useUnifiedTransactions: () => ({
    transactions: [],
    addTransaction: mocks.addTransaction,
    isDemo: false,
    canAddMoreTransactions: true,
  }),
}));
vi.mock("../src/platform/haptics.js", () => ({
  hapticSuccess: vi.fn(),
  hapticTap: vi.fn(),
}));

import TransactionForm from "../src/components/Transaction/TransactionForm.jsx";
import QuickAddForm from "../src/components/Dashboard/QuickAddForm.jsx";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("amountExpression", () => {
  it("evaluates arithmetic expressions with Italian decimals, Unicode operators and precedence", () => {
    expect(hasAmountExpression("12,50")).toBe(false);
    expect(hasAmountExpression("12,50 + 4,80")).toBe(true);
    expect(evaluateAmountExpression("12,50 + 4,80")).toBe(17.3);
    expect(evaluateAmountExpression("10 + 5 * 2")).toBe(20);
    expect(evaluateAmountExpression("(10 + 5) × 2")).toBe(30);
    expect(evaluateAmountExpression("75 ÷ 3")).toBe(25);
    expect(evaluateAmountExpression("100 / 3")).toBe(33.33);
    expect(evaluateAmountExpression("50 − 12,50")).toBe(37.5);
    expect(evaluateAmountExpression("1.200,50 + 100")).toBe(1300.5);
    expect(formatEvaluatedAmount(17.3)).toBe("17.30");
    expect(formatEvaluatedAmount(25)).toBe("25");
  });

  it("rejects invalid, incomplete, zero, negative and divide-by-zero expressions", () => {
    expect(evaluateAmountExpression("")).toBeNull();
    expect(evaluateAmountExpression("12 +")).toBeNull();
    expect(evaluateAmountExpression("10 / 0")).toBeNull();
    expect(evaluateAmountExpression("5 - 10")).toBeNull();
    expect(evaluateAmountExpression("5 - 5")).toBeNull();
    expect(evaluateAmountExpression("(10 + 2")).toBeNull();
    expect(evaluateAmountExpression("alert(1)")).toBeNull();
    expect(sanitizeAmountInput("12,50abc + 4€")).toBe("12,50 + 4");
  });
});

describe("TransactionForm inline calculator", () => {
  it("lets users combine amounts with operator chips, previews the result and submits the exact minor amount", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<TransactionForm onSubmit={onSubmit} />);

    const amountInput = screen.getByLabelText("transactionModal.amount");
    fireEvent.change(amountInput, { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: 'transactionModal.calcOp:{"op":"+"}' }));
    expect(amountInput).toHaveValue("12,50+");

    fireEvent.change(amountInput, { target: { value: "12,50+4,80" } });
    expect(screen.getByTestId("amount-calc-result")).toBeInTheDocument();

    fireEvent.submit(amountInput.closest("form"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 1730,
      amount: 17.3,
    }));
  });

  it("resolves the preview pill into the input when tapped and rejects incomplete expressions on submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<TransactionForm onSubmit={onSubmit} />);

    const amountInput = screen.getByLabelText("transactionModal.amount");
    fireEvent.change(amountInput, { target: { value: "75÷3" } });
    fireEvent.click(screen.getByTestId("amount-calc-result"));
    expect(amountInput).toHaveValue("25");

    fireEvent.change(amountInput, { target: { value: "25+" } });
    fireEvent.submit(amountInput.closest("form"));
    expect(mocks.notification.error).toHaveBeenCalledWith("transaction.invalidAmount");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("QuickAddForm inline calculator", () => {
  it("evaluates arithmetic expressions before submitting", async () => {
    mocks.addTransaction.mockResolvedValue(true);
    render(<QuickAddForm />);
    const amountInput = screen.getByLabelText("transactionModal.amount");
    fireEvent.change(amountInput, { target: { value: "12,50 + 4,80" } });
    fireEvent.submit(amountInput.closest("form"));
    await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalledTimes(1));
    expect(mocks.addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 1730,
      amount: 17.3,
    }));
  });
});

describe("amount expressions and the account currency", () => {
  it("rounds to the decimals of the account currency", () => {
    expect(evaluateAmountExpression("100 / 3")).toBe(33.33);
    expect(formatEvaluatedAmount(33.33)).toBe("33.33");
    setAccountCurrency("JPY");
    expect(evaluateAmountExpression("100 / 3")).toBe(33);
    expect(evaluateAmountExpression("1000 / 8")).toBe(125);
    expect(formatEvaluatedAmount(33.4)).toBe("33");
  });
});
