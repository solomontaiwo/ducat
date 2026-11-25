import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner", emailVerified: true },
  isDemo: true,
  fetchAll: vi.fn(),
  deleteTransaction: vi.fn(),
  transactions: [
    { id: "t1", type: "expense", amountMinor: 4200, amount: 42, description: "Esselunga", category: "supermercato", dateKey: "2026-11-10", date: new Date(2026, 10, 10, 12) },
    { id: "t2", type: "expense", amountMinor: 1500, amount: 15, description: "Biglietto treno", category: "trasporti", dateKey: "2026-11-12", date: new Date(2026, 10, 12, 12) },
  ],
  t: (key, options) => options?.defaultValue ?? key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }),
}));
vi.mock("../src/components/Layout/HeaderProfileButton.jsx", () => ({ default: () => null }));
vi.mock("../src/context/AuthProvider.jsx", () => ({
  useAuth: () => ({ currentUser: mocks.user, loading: false, profileName: "Ada", profileNameLoading: false }),
}));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({
  useUnifiedTransactions: () => ({
    transactions: mocks.transactions,
    isDemo: mocks.isDemo,
    loading: false,
    maxTransactions: 10,
    fetchAllTransactions: mocks.fetchAll,
    deleteTransaction: mocks.deleteTransaction,
    fetchTransactionPage: async () => ({ items: mocks.transactions, nextCursor: null, hasMore: false }),
    getTotalTransactionCount: async () => mocks.transactions.length,
    recentRevision: 1,
  }),
}));
vi.mock("../src/context/AddTransactionContext.jsx", () => ({
  useAddTransaction: () => ({ openAddTransaction: vi.fn(), canAdd: true }),
}));
vi.mock("../src/context/PlanningProvider.jsx", () => ({
  usePlanning: () => ({
    recurring: [],
    budgets: { supermercato: 10000 },
    preferences: { monthStartDay: 1, hiddenCategories: [], categoryOrder: { expense: [], income: [] } },
    ready: true,
  }),
}));
vi.mock("../src/components/Transaction/TransactionModal.jsx", () => ({
  default: ({ onDelete }) => onDelete ? <button onClick={onDelete}>Open delete confirmation</button> : null,
}));

import { RouterProvider } from "../src/router/RouterProvider.jsx";
import { PrivacyProvider } from "../src/context/PrivacyProvider.jsx";
import Dashboard from "../src/components/Dashboard/Dashboard.jsx";
import TransactionList from "../src/components/Transaction/TransactionList.jsx";

beforeEach(() => {
  mocks.isDemo = true;
  mocks.fetchAll.mockReset().mockResolvedValue(mocks.transactions);
  mocks.deleteTransaction.mockReset();
  localStorage.clear();
  document.documentElement.classList.remove("privacy-masked");
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("Category drill-down & Dashboard privacy toggle", () => {
  it("keeps the current month visible during a refresh and hides it when changing month", async () => {
    mocks.isDemo = false;
    window.history.replaceState({}, "", "/dashboard");
    const view = render(<RouterProvider><PrivacyProvider><Dashboard /></PrivacyProvider></RouterProvider>);
    await screen.findByRole("button", { name: /Esselunga/ });

    let resolveRefresh;
    mocks.fetchAll.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    mocks.transactions = [...mocks.transactions];
    view.rerender(<RouterProvider><PrivacyProvider><Dashboard /></PrivacyProvider></RouterProvider>);
    await waitFor(() => expect(mocks.fetchAll).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: /Esselunga/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "dashboard.summary" })).toHaveTextContent("dashboard.overspent");
    expect(within(screen.getByRole("region", { name: "dashboard.whereMoneyGoes" })).getByRole("link", { name: /supermercato/ })).toBeInTheDocument();
    const updated = mocks.transactions.map((item) => item.id === "t1" ? { ...item, description: "Esselunga aggiornata" } : item);
    await act(async () => resolveRefresh(updated));
    expect(screen.getByRole("button", { name: /Esselunga aggiornata/ })).toBeInTheDocument();

    let resolveOldMonth;
    mocks.fetchAll.mockReturnValueOnce(new Promise((resolve) => { resolveOldMonth = resolve; }));
    mocks.transactions = [...mocks.transactions];
    view.rerender(<RouterProvider><PrivacyProvider><Dashboard /></PrivacyProvider></RouterProvider>);
    await waitFor(() => expect(mocks.fetchAll).toHaveBeenCalledTimes(3));
    mocks.fetchAll.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "monthSwitcher.previous" }));
    expect(screen.queryByRole("button", { name: /Esselunga/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "dashboard.summary" })).not.toHaveTextContent("dashboard.overspent");
    await act(async () => resolveOldMonth(updated));
    expect(screen.queryByRole("button", { name: /Esselunga/ })).not.toBeInTheDocument();
  });

  it("confirms deletion from recent transactions and keeps the editor on failure", async () => {
    mocks.deleteTransaction.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    window.history.replaceState({}, "", "/dashboard");
    render(<RouterProvider><PrivacyProvider><Dashboard /></PrivacyProvider></RouterProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Esselunga/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open delete confirmation" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
    expect(mocks.deleteTransaction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open delete confirmation" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "transactions.deleteConfirm" }));
    await waitFor(() => expect(mocks.deleteTransaction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Esselunga")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "transactions.deleteConfirm" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.deleteTransaction).toHaveBeenLastCalledWith("t1");
    expect(screen.queryByRole("button", { name: /Esselunga/ })).not.toBeInTheDocument();
  });

  it("renders clickable category links and privacy toggle on Dashboard", async () => {
    window.history.replaceState({}, "", "/dashboard");
    render(
      <RouterProvider>
        <PrivacyProvider>
          <Dashboard />
        </PrivacyProvider>
      </RouterProvider>
    );

    const categoryLinks = await screen.findAllByRole("link", { name: /supermercato/ });
    expect(categoryLinks.length).toBeGreaterThanOrEqual(2); // "Where money goes" + BudgetCard
    for (const link of categoryLinks) {
      expect(link.getAttribute("href")).toMatch(/^\/transactions\?category=supermercato&type=expense&month=\d{4}-\d{2}$/);
    }

    const privacyToggle = screen.getByRole("button", { name: "privacy.hideAmounts" });
    fireEvent.click(privacyToggle);
    expect(document.documentElement.classList.contains("privacy-masked")).toBe(true);
    expect(screen.getByRole("button", { name: "privacy.showAmounts" })).toBeInTheDocument();
  });

  it("initializes TransactionList filters from drill-down URL params and resets them", async () => {
    window.history.replaceState({}, "", "/transactions?category=supermercato&type=expense&allTime=1");
    render(
      <RouterProvider>
        <TransactionList />
      </RouterProvider>
    );

    expect(await screen.findByText("Esselunga")).toBeInTheDocument();
    expect(screen.queryByText("Biglietto treno")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "transactions.filters.reset" }));
    await waitFor(() => expect(screen.getByText("Biglietto treno")).toBeInTheDocument());
  });
});
