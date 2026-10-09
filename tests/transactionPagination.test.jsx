import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TransactionList from "../src/components/Transaction/TransactionList.jsx";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner" },
  transactions: [],
  fetch: vi.fn(), count: vi.fn(), totals: undefined, observers: [],
  t: (key, options) => options?.returnObjects ? [] : key,
}));
vi.mock("../src/components/Layout/HeaderProfileButton.jsx", () => ({ default: () => null }));
vi.mock("../src/context/AuthProvider.jsx", () => ({ useAuth: () => ({ currentUser: mocks.user, loading: false }) }));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({ useUnifiedTransactions: () => ({
  transactions: mocks.transactions, loading: false, isDemo: false,
  fetchTransactionPage: mocks.fetch, getTotalTransactionCount: mocks.count, getTransactionTotals: mocks.totals, recentRevision: 0,
}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }) }));
vi.mock("../src/components/Transaction/TransactionModal.jsx", () => ({ default: () => null }));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const item = (id) => ({ id, description: id, date: new Date(), amount: 5, category: "altro", type: "expense" });
const page = (id, hasMore = true) => ({ items: [item(id)], nextCursor: id, hasMore });
const intersect = () => act(() => {
  mocks.observers.filter((observer) => observer.active).forEach((observer) => observer.callback([{ isIntersecting: true }]));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactions = [];
  mocks.observers = [];
  mocks.totals = undefined;
  mocks.count.mockResolvedValue(100);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback) { this.callback = callback; mocks.observers.push(this); }
    observe() { this.active = true; }
    unobserve() { this.active = false; }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["success", "failure"])("ignores stale pagination %s after changing period, including cursor and loading state", async (outcome) => {
  const old = deferred(), current = deferred();
  mocks.fetch.mockResolvedValueOnce(page("first"))
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(page("new-first"))
    .mockReturnValueOnce(current.promise);
  render(<TransactionList />);
  await screen.findByText("first");
  intersect();
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "transactions.filters.allTime" }));
  await screen.findByText("new-first");
  intersect();
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(4));
  expect(mocks.fetch.mock.calls[3][0].cursor).toBe("new-first");
  await act(async () => {
    if (outcome === "success") old.resolve(page("obsolete", false));
    else old.reject(new Error("offline"));
  });
  expect(screen.queryByText("obsolete")).not.toBeInTheDocument();
  expect(screen.queryByText("Impossibile caricare altre transazioni. Riprova.")).not.toBeInTheDocument();
  expect(screen.getByText("loading")).toBeInTheDocument();
  intersect();
  expect(mocks.fetch).toHaveBeenCalledTimes(4);
  await act(async () => { current.resolve(page("new-second", false)); });
  expect(screen.getByText("new-second")).toBeInTheDocument();
  expect(screen.queryByText("loading")).not.toBeInTheDocument();
});

it("ignores an obsolete count and keeps an empty page empty instead of using the recent stream", async () => {
  const oldCount = deferred();
  mocks.count.mockReturnValueOnce(oldCount.promise).mockResolvedValue(2);
  mocks.transactions = [item("recent-only")];
  mocks.fetch.mockResolvedValueOnce(page("first", false)).mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
  render(<TransactionList />);
  await screen.findByText("first");
  fireEvent.click(screen.getByRole("button", { name: "transactions.filters.allTime" }));
  await screen.findByText("0 / 2");
  await act(async () => { oldCount.resolve(100); });
  expect(screen.getByText("0 / 2")).toBeInTheDocument();
  expect(screen.queryByText("recent-only")).not.toBeInTheDocument();
});

it("shows period totals from the server and loads every remaining page on request", async () => {
  mocks.totals = vi.fn().mockResolvedValue({ count: 3, incomeMinor: 0, expenseMinor: 1500 });
  mocks.count.mockResolvedValue(3);
  mocks.fetch
    .mockResolvedValueOnce({ items: [item("first")], nextCursor: "first", hasMore: true })
    .mockResolvedValueOnce({ items: [item("second")], nextCursor: "second", hasMore: true })
    .mockResolvedValueOnce({ items: [item("third")], nextCursor: null, hasMore: false });
  render(<TransactionList />);
  await screen.findByText("first");
  expect(await screen.findByText("3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "transactions.loadAll" }));
  await screen.findByText("third");
  expect(screen.getByText("second")).toBeInTheDocument();
  expect(mocks.fetch.mock.calls[1][0]).toMatchObject({ cursor: "first", pageSize: 200 });
  expect(mocks.fetch.mock.calls[2][0]).toMatchObject({ cursor: "second", pageSize: 200 });
  expect(screen.queryByRole("button", { name: "transactions.loadAll" })).not.toBeInTheDocument();
});
