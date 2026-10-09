/* eslint-disable react/prop-types */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  recent: [],
  t: (key, options) => options?.defaultValue ?? key,
  i18n: { language: "it" },
  state: { isDemo: false, user: { uid: "owner" } },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: mocks.i18n }),
}));
vi.mock("recharts", () => {
  const Box = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box, PieChart: Box, Pie: () => null, Sector: () => null, AreaChart: Box, Area: () => null,
    BarChart: Box, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, Legend: () => null,
  };
});
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({
  useUnifiedTransactions: () => ({
    isDemo: mocks.state.isDemo,
    transactions: mocks.recent,
    maxTransactions: 10,
    loading: false,
    fetchAllTransactions: mocks.fetchAll,
  }),
}));
vi.mock("../src/context/AuthProvider.jsx", () => ({ useAuth: () => ({ currentUser: mocks.state.user }) }));
vi.mock("../src/utils/categories.jsx", () => ({
  useCategories: () => ({
    expenseCategories: [{ value: "cibo", label: "🍕 Cibo" }],
    incomeCategories: [{ value: "stipendio", label: "💼 Stipendio" }],
  }),
}));
vi.mock("../src/utils/ThemeProvider.jsx", () => ({ useTheme: () => ({ isDarkMode: false }) }));
vi.mock("../src/utils/downloadUtils.jsx", () => ({
  getCurrentProfileName: async () => "ada",
  generateExportFileName: () => "report.csv",
}));

import TransactionAnalytics from "../src/components/Analytics/TransactionAnalytics.jsx";

const now = new Date();
const tx = (id, type, category, amountMinor, day) => ({
  id, type, category, amountMinor, amount: amountMinor / 100, description: `desc-${id}`,
  date: new Date(now.getFullYear(), now.getMonth(), day, 12),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.clear();
  mocks.state.isDemo = false;
  mocks.state.user = { uid: "owner" };
  mocks.fetchAll.mockReset();
});
afterEach(cleanup);

describe("TransactionAnalytics", () => {
  it("loads one bounded range and renders totals, top categories and top movements", async () => {
    mocks.fetchAll.mockResolvedValue([
      tx("a", "expense", "cibo", 1250, 1),
      tx("b", "income", "stipendio", 200000, 1),
    ]);
    render(<TransactionAnalytics />);
    expect(await screen.findByText("analytics.title")).toBeInTheDocument();
    expect(mocks.fetchAll).toHaveBeenCalledTimes(1);
    const range = mocks.fetchAll.mock.calls[0][0];
    expect(range.startDate).toBeInstanceOf(Date);
    expect(range.endDate).toBeInstanceOf(Date);
    expect(screen.getAllByText("Cibo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stipendio").length).toBeGreaterThan(0);
    expect(screen.getByText("desc-a")).toBeInTheDocument();
  });

  it("explains a permission error instead of showing stale data", async () => {
    mocks.fetchAll.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    render(<TransactionAnalytics />);
    expect(await screen.findByRole("alert")).toHaveTextContent("security.emailVerificationRequired");
  });

  it("persists the chosen period and reloads for the new range", async () => {
    mocks.fetchAll.mockResolvedValue([tx("a", "expense", "cibo", 100, 1)]);
    render(<TransactionAnalytics />);
    const select = (await screen.findAllByRole("combobox"))[0];
    fireEvent.change(select, { target: { value: "year" } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem("analytics-period")).period).toBe("year"));
    await waitFor(() => expect(mocks.fetchAll.mock.calls.length).toBeGreaterThan(1));
  });

  it("enables CSV export only when the period has data", async () => {
    mocks.fetchAll.mockResolvedValue([tx("a", "expense", "cibo", 100, 1)]);
    render(<TransactionAnalytics />);
    const button = await screen.findByRole("button", { name: "analytics.exportCsv" });
    expect(button).toBeEnabled();
    cleanup();
    mocks.fetchAll.mockResolvedValue([]);
    render(<TransactionAnalytics />);
    expect(await screen.findByRole("button", { name: "analytics.exportCsv" })).toBeDisabled();
  });

  it("does not query Firestore for a signed-out visitor", async () => {
    mocks.state.user = null;
    render(<TransactionAnalytics />);
    await screen.findByText("analytics.title");
    expect(mocks.fetchAll).not.toHaveBeenCalled();
    expect(within(document.body).queryByRole("alert")).toBeNull();
  });
});
