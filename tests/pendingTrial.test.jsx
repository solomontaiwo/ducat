import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null,
  add: vi.fn(),
  stopDemo: vi.fn(),
  stubUnified: false,
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
}));

vi.mock("../src/context/AuthProvider.jsx", () => ({ useAuth: () => ({ currentUser: mocks.user, loading: false }) }));
vi.mock("../src/context/AuthProvider", () => ({ useAuth: () => ({ currentUser: mocks.user, loading: false }) }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/utils/notificationUtils", () => ({ useNotification: () => mocks.notification }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }) }));
vi.mock("../src/services/transactionService.jsx", () => ({
  TransactionService: {
    subscribeToRecent: (_uid, _limit, callback) => { callback([]); return () => {}; },
    fetchAll: async () => [],
    fetchPage: async () => ({ items: [], nextCursor: null, hasMore: false }),
    getTotalCount: async () => 0,
    getTotals: async () => ({ count: 0, incomeMinor: 0, expenseMinor: 0 }),
    getFirstDate: async () => null,
    add: (...args) => mocks.add(...args),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// The prompt only needs `stopDemo`; the provider tests use the real hook.
vi.mock("../src/context/UnifiedTransactionProvider.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useUnifiedTransactions: () => (mocks.stubUnified ? { stopDemo: mocks.stopDemo } : actual.useUnifiedTransactions()),
  };
});

import DemoImportPrompt from "../src/components/Layout/DemoImportPrompt.jsx";
import { UnifiedTransactionProvider, useUnifiedTransactions } from "../src/context/UnifiedTransactionProvider.jsx";
import { resolveRouteAccess } from "../src/router/accessPolicy.js";
import {
  clearDemoData,
  readImportableDemoTransactions,
  removeDemoTransactions,
} from "../src/utils/demoStorage.js";

const movement = (id, extra = {}) => ({
  id, type: "expense", amountMinor: 1250, amount: 12.5, currency: "EUR",
  description: `Movement ${id}`, category: "altro", dateKey: "2026-11-20", isSample: false, ...extra,
});
const storeDemo = (items) => localStorage.setItem("ducat-demo-transactions", JSON.stringify(items));
const pendingUser = { uid: null, email: "ada@example.com", emailVerified: false, pending: true, metadata: {} };
const verifiedUser = { uid: "owner", email: "ada@example.com", emailVerified: true, metadata: {} };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.user = null;
  mocks.stubUnified = false;
  mocks.add.mockResolvedValue({ id: "ok" });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("demo storage", () => {
  it("lists only user movements and survives broken data", () => {
    storeDemo([movement("a"), movement("sample", { isSample: true }), null, { isSample: false }]);
    expect(readImportableDemoTransactions().map((item) => item.id)).toEqual(["a"]);
    localStorage.setItem("ducat-demo-transactions", "{broken");
    expect(readImportableDemoTransactions()).toEqual([]);
  });

  it("removes imported movements and clears every demo key", () => {
    storeDemo([movement("a"), movement("b")]);
    expect(removeDemoTransactions(["a"])).toBe(true);
    expect(readImportableDemoTransactions().map((item) => item.id)).toEqual(["b"]);
    for (const key of ["ducat-demo-enabled", "ducat-demo-recurring", "ducat-demo-budgets", "ducat-demo-preferences"]) {
      localStorage.setItem(key, "x");
    }
    expect(clearDemoData()).toBe(true);
    expect(Object.keys(localStorage).filter((key) => key.startsWith("ducat-demo-"))).toEqual([]);
  });
});

describe("trial while waiting for the confirmation email", () => {
  it("runs the local demo for a pending sign-up once it is started", async () => {
    mocks.user = pendingUser;
    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDemo).toBe(false);
    act(() => { result.current.startDemo(); });
    await waitFor(() => expect(result.current.isDemo).toBe(true));
    expect(localStorage.getItem("ducat-demo-enabled")).toBe("true");
  });

  it("never runs the demo for a verified account, even with the flag stored", async () => {
    localStorage.setItem("ducat-demo-enabled", "true");
    mocks.user = verifiedUser;
    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.isDemo).toBe(false);
  });

  it("opens the app pages during the trial and keeps the account pages closed", () => {
    expect(resolveRouteAccess({ access: "app", currentUser: pendingUser, isDemo: true, pathname: "/dashboard" })).toBeNull();
    expect(resolveRouteAccess({ access: "app", currentUser: pendingUser, isDemo: false, pathname: "/dashboard" })).toBe("/verify-email");
    expect(resolveRouteAccess({ access: "authenticated", currentUser: pendingUser, isDemo: true, pathname: "/profile" })).toBe("/verify-email");
    expect(resolveRouteAccess({ access: "authenticated-unverified", currentUser: pendingUser, isDemo: true, pathname: "/verify-email" })).toBeNull();
  });
});

describe("importing the trial into the account", () => {
  const renderPrompt = async () => {
    mocks.user = verifiedUser;
    mocks.stubUnified = true;
    return render(<DemoImportPrompt />);
  };

  it("stays hidden without user movements", async () => {
    storeDemo([movement("sample", { isSample: true })]);
    await renderPrompt();
    expect(screen.queryByText("demo.import.title")).toBeNull();
  });

  it("imports each movement with a stable id, then ends the trial", async () => {
    localStorage.setItem("ducat-demo-enabled", "true");
    storeDemo([movement("a"), movement("sample", { isSample: true }), movement("b", { type: "income" })]);
    await renderPrompt();
    expect(screen.getByText('demo.import.description:{"count":2}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "demo.import.action" }));
    await waitFor(() => expect(mocks.notification.success).toHaveBeenCalledWith('demo.import.done:{"count":2}'));
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.add).toHaveBeenNthCalledWith(1, "owner", expect.objectContaining({
      type: "expense", amountMinor: 1250, description: "Movement a", dateKey: "2026-11-20",
    }), { requestId: "demo-a" });
    expect(mocks.add.mock.calls[0][1]).not.toHaveProperty("recurring");
    expect(mocks.add).toHaveBeenNthCalledWith(2, "owner", expect.objectContaining({ type: "income" }), { requestId: "demo-b" });
    expect(mocks.stopDemo).toHaveBeenCalled();
    expect(localStorage.getItem("ducat-demo-transactions")).toBeNull();
    expect(localStorage.getItem("ducat-demo-enabled")).toBeNull();
    expect(screen.queryByText("demo.import.title")).toBeNull();
  });

  it("keeps on the device what failed, and retries with the same ids", async () => {
    storeDemo([movement("a"), movement("b")]);
    mocks.add.mockResolvedValueOnce({ id: "ok" }).mockRejectedValueOnce(new Error("network"));
    await renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "demo.import.action" }));
    await waitFor(() => expect(mocks.notification.error)
      .toHaveBeenCalledWith('demo.import.partial:{"imported":1,"remaining":1}'));
    expect(readImportableDemoTransactions().map((item) => item.id)).toEqual(["b"]);
    expect(mocks.stopDemo).not.toHaveBeenCalled();
    expect(screen.getByText('demo.import.description:{"count":1}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "demo.import.action" }));
    await waitFor(() => expect(mocks.notification.success).toHaveBeenCalledWith('demo.import.done:{"count":1}'));
    expect(mocks.add).toHaveBeenLastCalledWith("owner", expect.anything(), { requestId: "demo-b" });
  });

  it("does not try offline and keeps the data", async () => {
    storeDemo([movement("a")]);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "demo.import.action" }));
    expect(mocks.notification.error).toHaveBeenCalledWith("demo.import.offline");
    expect(mocks.add).not.toHaveBeenCalled();
    expect(readImportableDemoTransactions()).toHaveLength(1);
  });

  it("deletes the trial data only after confirmation", async () => {
    storeDemo([movement("a")]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "demo.import.discard" }));
    expect(readImportableDemoTransactions()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "demo.import.discard" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(readImportableDemoTransactions()).toEqual([]);
    expect(mocks.notification.info).toHaveBeenCalledWith("demo.import.discarded");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("can be postponed without touching the data", async () => {
    storeDemo([movement("a")]);
    await renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "demo.import.later" }));
    expect(screen.queryByText("demo.import.title")).toBeNull();
    expect(readImportableDemoTransactions()).toHaveLength(1);
  });
});
