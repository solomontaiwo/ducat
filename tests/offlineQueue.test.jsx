import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner", emailVerified: true },
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  fetchPage: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  getTotalCount: vi.fn(async () => 0),
  getTotals: vi.fn(async () => ({ count: 0, incomeMinor: 0, expenseMinor: 0 })),
  serverRows: [],
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
}));

vi.mock("../src/context/AuthProvider.jsx", () => ({
  useAuth: () => ({ currentUser: mocks.user, loading: false }),
}));
vi.mock("../src/utils/notificationUtils.jsx", () => ({
  useNotification: () => mocks.notification,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }),
}));
vi.mock("../src/services/transactionService.jsx", () => ({
  TransactionService: {
    subscribeToRecent: (_uid, _limit, callback) => { callback(mocks.serverRows); return () => {}; },
    fetchAll: async () => mocks.serverRows,
    fetchPage: (...args) => mocks.fetchPage(...args),
    getTotalCount: (...args) => mocks.getTotalCount(...args),
    getTotals: (...args) => mocks.getTotals(...args),
    getFirstDate: async () => null,
    add: mocks.add,
    update: mocks.update,
    delete: mocks.remove,
  },
}));

import {
  buildOfflinePage,
  computeOfflineTotals,
  clearAllOfflineQueues,
  enqueueOfflineTransaction,
  queuedItemToTransaction,
  readOfflineQueue,
  removeOfflineTransaction,
} from "../src/utils/offlineQueue.js";
import { setAccountCurrency } from "../src/utils/currency.js";
import { UnifiedTransactionProvider, useUnifiedTransactions } from "../src/context/UnifiedTransactionProvider.jsx";
import OfflineNotice from "../src/components/Layout/OfflineNotice.jsx";

const setNavigatorOnline = (value) => {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.serverRows = [];
  mocks.fetchPage.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mocks.getTotalCount.mockResolvedValue(0);
  mocks.getTotals.mockResolvedValue({ count: 0, incomeMinor: 0, expenseMinor: 0 });
  setNavigatorOnline(true);
});

afterEach(() => {
  cleanup();
  clearAllOfflineQueues();
  setNavigatorOnline(true);
  vi.restoreAllMocks();
});

describe("offlineQueue store", () => {
  const sample = {
    type: "expense",
    amountMinor: 1250,
    description: "Caffè",
    category: "alimentazione",
    dateKey: "2026-11-24",
  };

  it("validates, deduplicates by clientRequestId and isolates per user", () => {
    const first = enqueueOfflineTransaction("u1", sample, { requestId: "req-1" });
    expect(first.ok).toBe(true);
    expect(readOfflineQueue("u1")).toHaveLength(1);
    expect(readOfflineQueue("u2")).toHaveLength(0);

    const dup = enqueueOfflineTransaction("u1", sample, { requestId: "req-1" });
    expect(dup.ok).toBe(true);
    expect(readOfflineQueue("u1")).toHaveLength(1);

    const tx = queuedItemToTransaction("u1", first.entry);
    expect(tx).toMatchObject({ id: "u1_req-1", amount: 12.5, pendingSync: true, description: "Caffè" });

    removeOfflineTransaction("u1", "req-1");
    expect(readOfflineQueue("u1")).toHaveLength(0);
  });

  it("keeps the account currency of the moment an item was queued", () => {
    setAccountCurrency("GBP");
    const queued = enqueueOfflineTransaction("u1", sample, { requestId: "req-gbp" });
    setAccountCurrency("EUR");
    expect(queued.entry.payload.currency).toBe("GBP");
    expect(queuedItemToTransaction("u1", readOfflineQueue("u1")[0]).currency).toBe("GBP");
    expect(() => enqueueOfflineTransaction("u1", { ...sample, currency: "XYZ" }, { requestId: "req-x" })).toThrow("Invalid currency");
  });

  it("rejects invalid payloads before touching storage", () => {
    expect(() => enqueueOfflineTransaction("u1", { ...sample, amountMinor: -5 })).toThrow();
    expect(readOfflineQueue("u1")).toHaveLength(0);
  });
});

describe("UnifiedTransactionProvider offline write queue", () => {
  it("queues writes while offline, shows them optimistically and flushes on reconnect", async () => {
    mocks.add.mockResolvedValue({ id: "owner_req-offline" });
    setNavigatorOnline(false);

    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    let saved;
    await act(async () => {
      saved = await result.current.addTransaction({
        type: "expense",
        amountMinor: 750,
        amount: 7.5,
        description: "Biglietto metro",
        category: "trasporti",
        dateKey: "2026-11-24",
        clientRequestId: "req-offline",
      });
    });

    expect(saved).toBe(true);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(result.current.pendingOfflineCount).toBe(1);
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]).toMatchObject({ description: "Biglietto metro", pendingSync: true });
    expect(mocks.notification.info).toHaveBeenCalledWith("offline.queuedSuccess");

    // Reconnect: auto-flush replays the idempotent requestId and clears the queue.
    setNavigatorOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });

    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({ description: "Biglietto metro", amountMinor: 750 }),
      { requestId: "req-offline" }
    ));
    await waitFor(() => expect(result.current.pendingOfflineCount).toBe(0));
    expect(mocks.notification.success).toHaveBeenCalledWith('offline.synced:{"count":1}');
  });

  it("falls back to local cached + pending transactions for page, count and totals while offline", async () => {
    mocks.serverRows = [
      {
        id: "srv-1",
        type: "income",
        amountMinor: 100000,
        amount: 1000,
        description: "Stipendio",
        category: "stipendio",
        dateKey: "2026-11-10",
        date: new Date(2026, 10, 10),
      },
      {
        id: "srv-old",
        type: "expense",
        amountMinor: 2000,
        amount: 20,
        description: "Ottobre",
        category: "altro",
        dateKey: "2026-10-05",
        date: new Date(2026, 9, 5),
      },
    ];
    mocks.fetchPage.mockRejectedValue(new Error("offline"));
    mocks.getTotalCount.mockRejectedValue(new Error("offline"));
    mocks.getTotals.mockRejectedValue(new Error("offline"));

    enqueueOfflineTransaction("owner", {
      type: "expense",
      amountMinor: 1550,
      description: "Pranzo offline",
      category: "alimentazione",
      dateKey: "2026-11-24",
    }, { requestId: "req-page" });

    setNavigatorOnline(false);

    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.pendingOfflineCount).toBe(1));

    const range = { startDate: new Date(2026, 10, 1), endDate: new Date(2026, 10, 30), type: "all" };
    const page = await result.current.fetchTransactionPage({ ...range, pageSize: 10 });
    expect(page.items.map((item) => item.description)).toEqual(["Pranzo offline", "Stipendio"]);
    expect(page.hasMore).toBe(false);

    await expect(result.current.getTotalTransactionCount(range)).resolves.toBe(2);
    await expect(result.current.getTransactionTotals(range)).resolves.toEqual({
      count: 2,
      incomeMinor: 100000,
      expenseMinor: 1550,
    });

    // When online, errors still propagate instead of masking real failures.
    setNavigatorOnline(true);
    await expect(result.current.fetchTransactionPage(range)).rejects.toThrow("offline");
  });

  it("edits and deletes pendingSync offline transactions in-place without calling Supabase", async () => {
    setNavigatorOnline(false);
    enqueueOfflineTransaction("owner", {
      type: "expense",
      amountMinor: 900,
      description: "Panino",
      category: "alimentazione",
      dateKey: "2026-11-24",
    }, { requestId: "req-edit" });

    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.pendingOfflineCount).toBe(1));
    const pendingId = result.current.transactions[0].id;

    let updated;
    await act(async () => {
      updated = await result.current.updateTransaction(pendingId, {
        amountMinor: 1150,
        amount: 11.5,
        description: "Panino e acqua",
      });
    });
    expect(updated).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(result.current.transactions[0]).toMatchObject({ description: "Panino e acqua", amountMinor: 1150 });

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteTransaction(pendingId);
    });
    expect(deleted).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingOfflineCount).toBe(0);
    expect(readOfflineQueue("owner")).toHaveLength(0);
  });

  it("queues offline updates and deletes for already-synced rows and replays them on reconnect", async () => {
    mocks.serverRows = [
      {
        id: "srv-edit",
        type: "expense",
        amountMinor: 1500,
        amount: 15,
        description: "Pranzo",
        category: "alimentazione",
        dateKey: "2026-11-24",
        date: new Date(2026, 10, 24),
      },
      {
        id: "srv-del",
        type: "expense",
        amountMinor: 800,
        amount: 8,
        description: "Parcheggio",
        category: "trasporti",
        dateKey: "2026-11-24",
        date: new Date(2026, 10, 24),
      },
    ];
    mocks.update.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    setNavigatorOnline(false);

    const { result } = renderHook(() => useUnifiedTransactions(), { wrapper: UnifiedTransactionProvider });
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    await act(async () => {
      await result.current.updateTransaction("srv-edit", { description: "Pranzo lavoro", amountMinor: 1800 });
      await result.current.deleteTransaction("srv-del");
    });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingOfflineCount).toBe(2);
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]).toMatchObject({ id: "srv-edit", description: "Pranzo lavoro", amountMinor: 1800, pendingSync: true });

    setNavigatorOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("srv-edit", expect.objectContaining({ description: "Pranzo lavoro", amountMinor: 1800 })));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("srv-del"));
    await waitFor(() => expect(result.current.pendingOfflineCount).toBe(0));
  });
});

describe("OfflineNotice", () => {
  it("shows pending count while offline and a manual sync button when back online", async () => {
    mocks.add.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce({ id: "owner_req-2" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    setNavigatorOnline(false);
    enqueueOfflineTransaction("owner", {
      type: "expense",
      amountMinor: 500,
      description: "Pane",
      category: "supermercato",
      dateKey: "2026-11-24",
    }, { requestId: "req-2" });

    render(
      <UnifiedTransactionProvider>
        <OfflineNotice />
      </UnifiedTransactionProvider>
    );

    expect(await screen.findByText(/offline\.bodyWithPending/)).toBeInTheDocument();

    setNavigatorOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    // First auto-sync attempt fails, leaving the manual "Sync now" action visible.
    const syncButton = await screen.findByRole("button", { name: "offline.syncNow" });
    fireEvent.click(syncButton);

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});

it("applies the category and amount order to cached and pending rows before offline pagination", () => {
  const item = (id, category, amount) => ({ id, category, amount, amountMinor: amount * 100, type: "expense", date: new Date(2026, 0, 1) });
  const cached = [item("small", "casa", 5), item("other", "altro", 200)];
  const pending = [item("large", "casa", 100), cached[0]];
  const filters = { category: "casa", sortBy: "amount-desc", pageSize: 1 };
  const first = buildOfflinePage(cached, pending, filters);
  expect(first.items.map(row => row.id)).toEqual(["large"]);
  expect(buildOfflinePage(cached, pending, { ...filters, cursor: first.nextCursor }).items.map(row => row.id)).toEqual(["small"]);
  expect(computeOfflineTotals(cached, pending, filters)).toEqual({ count: 2, expenseMinor: 10500, incomeMinor: 0 });
});
