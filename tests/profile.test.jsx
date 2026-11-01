/* eslint-disable react/prop-types */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const today = new Date();
  const tx = (id, type, category, amountMinor, monthsAgo, day = 27) => ({
    id, type, category, amountMinor, amount: amountMinor / 100, description: id,
    date: new Date(today.getFullYear(), today.getMonth() - monthsAgo, day, 12),
  });
  return {
    transactions: [
      tx("s1", "income", "stipendio", 200000, 1), tx("s2", "income", "stipendio", 200000, 2), tx("s3", "income", "stipendio", 200000, 3),
      tx("e1", "expense", "supermercato", 5000, 0, 1),
    ],
    preferences: {
      monthStartDay: 1, defaultType: "last", defaultCategory: null, quickAmounts: [5, 10, 20, 50, 100],
      hiddenCategories: [], categoryOrder: { expense: [], income: [] }, lastBackupAt: null,
    },
    savePreferences: vi.fn(async () => true),
    notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    navigate: vi.fn(),
    saveProfileName: vi.fn(async (_user, name) => name),
    refreshProfileName: vi.fn(async () => "Ada"),
    toggleTheme: vi.fn(),
    changeLanguage: vi.fn(),
  };
});

vi.mock("react-i18next", () => {
  const value = {
    t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: "it", changeLanguage: mocks.changeLanguage },
  };
  return { useTranslation: () => value };
});
vi.mock("../src/context/AuthProvider.jsx", () => ({
  useAuth: () => ({
    currentUser: { uid: "u1", email: "ada@example.com", emailVerified: true, metadata: { creationTime: "2025-03-01T10:00:00Z" } },
    loading: false, logout: vi.fn(), profileName: "Ada", profileNameLoading: false, refreshProfileName: mocks.refreshProfileName,
  }),
}));
// Context values must keep their identity between renders, as they do in the app.
const stable = vi.hoisted(() => ({}));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => {
  const value = {
    isDemo: true, loading: false, transactions: mocks.transactions, recentRevision: 1,
    fetchAllTransactions: async () => mocks.transactions,
    getTotalTransactionCount: async () => 0, getTransactionTotals: async () => ({}), getFirstTransactionDate: async () => null,
  };
  return { useUnifiedTransactions: () => value };
});
vi.mock("../src/context/PlanningProvider.jsx", () => {
  stable.planning = {
    recurring: [{ id: "r1", type: "expense", amountMinor: 65000, frequency: "monthly", paused: false }],
    budgets: { supermercato: 10000 }, preferences: mocks.preferences, ready: true, savePreferences: mocks.savePreferences,
  };
  return { usePlanning: () => stable.planning };
});
vi.mock("../src/utils/ThemeProvider", () => ({ useTheme: () => ({ theme: "system", toggleTheme: mocks.toggleTheme }) }));
vi.mock("../src/utils/notificationUtils", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/router/RouterProvider", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("../src/services/profileService.js", () => ({ saveProfileName: mocks.saveProfileName }));
vi.mock("../src/services/accountService.js", () => ({
  deleteCurrentAccount: vi.fn(), requestEmailChange: vi.fn(async () => {}), requestPasswordReset: vi.fn(async () => {}),
}));

import Profile from "../src/components/Profile/Profile.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.savePreferences.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Profile", () => {
  it("shows the summary and the planning previews", async () => {
    render(<Profile />);
    expect(screen.getByRole("heading", { level: 1, name: "profilePage.title" })).toBeInTheDocument();
    // 4 movements over 4 months (salaries from 1–3 months ago plus this month).
    await waitFor(() => expect(screen.getAllByText("4")).toHaveLength(2));
    expect(screen.getByText(/profilePage.recurringSummary/)).toHaveTextContent("650");
    await waitFor(() => expect(screen.getByText(/profilePage.budgetSummary/)).toHaveTextContent('"onTrack":1'));
    expect(screen.getByText(/profilePage.backup.never/)).toBeInTheDocument();
  });

  it("switches theme and language inline", () => {
    render(<Profile />);
    fireEvent.click(screen.getByRole("radio", { name: "profile.themeDark" }));
    expect(mocks.toggleTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(mocks.changeLanguage).toHaveBeenCalledWith("en");
  });

  it("saves a payday month start, suggesting the usual salary day", async () => {
    render(<Profile />);
    fireEvent.click(screen.getByTestId("row-month-start"));
    const sheet = await screen.findByRole("dialog");
    const suggestion = await within(sheet).findByText(/profilePage.monthStart.suggestion/);
    fireEvent.click(suggestion);
    expect(within(sheet).getByTestId("month-start-day")).toHaveTextContent("27");
    fireEvent.click(within(sheet).getByRole("button", { name: "profilePage.monthStart.later" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledWith({ monthStartDay: 28 }));
  });

  it("saves quick-add defaults", async () => {
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: /profilePage.quickAdd.title/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("radio", { name: "transactionModal.income" }));
    fireEvent.change(within(sheet).getByLabelText(/amountLabel.*"index":1/), { target: { value: "15" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledWith(expect.objectContaining({
      defaultType: "income", defaultCategory: "stipendio", quickAmounts: [15, 10, 20, 50, 100],
    })));
  });

  it("hides a category and keeps 'altro' visible", async () => {
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: /profilePage.categories.title/ }));
    const sheet = await screen.findByRole("dialog");
    const switches = within(sheet).getAllByRole("switch");
    expect(switches.at(-1)).toBeDisabled();
    fireEvent.click(switches[1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ hiddenCategories: ["alimentazione"] })));
  });

  it("counts what an export will contain", async () => {
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: /profilePage.export.title/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("profilePage.export.period"), { target: { value: "all" } });
    await waitFor(() => expect(within(sheet).getByTestId("export-count")).toHaveTextContent('"count":4'));
  });

  it("renames the user from a sheet", async () => {
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: /Ada/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("profilePage.name.label"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mocks.saveProfileName).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "u1", email: "ada@example.com" }),
      "Ada Lovelace"
    ));
    await waitFor(() => expect(mocks.refreshProfileName).toHaveBeenCalled());
    expect(mocks.notification.success).toHaveBeenCalledWith("profile.usernameSuccess");
  });

  it("reports a failed rename", async () => {
    mocks.saveProfileName.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: /Ada/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("profilePage.name.label"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mocks.notification.error).toHaveBeenCalledWith("profile.usernamePermissionError"));
  });
});
