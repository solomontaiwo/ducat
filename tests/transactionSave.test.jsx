import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UnifiedTransactionProvider } from "../src/context/UnifiedTransactionProvider.jsx";
import TransactionModal from "../src/components/Transaction/TransactionModal.jsx";
import AppRouter from "../src/router/AppRouter.jsx";
import { RouterProvider } from "../src/router/RouterProvider.jsx";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner", emailVerified: true },
  add: vi.fn(),
  notification: { success: vi.fn(), error: vi.fn() },
  t: (key) => key,
}));
vi.mock("../src/context/AuthProvider.jsx", () => ({ useAuth: () => ({ currentUser: mocks.user, loading: false }) }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => mocks.notification }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }) }));
vi.mock("../src/services/transactionService.jsx", () => ({ TransactionService: {
  subscribeToRecent: (uid, limit, callback) => { callback([]); return () => {}; },
  add: mocks.add,
} }));
vi.mock("../src/components/Layout/AppLayout.jsx", () => ({ default: ({ children }) => children }));
vi.mock("../src/components/Profile/Profile.jsx", async () => {
  const { default: Modal } = await import("../src/components/Transaction/TransactionModal.jsx");
  return { default: () => <Modal show onClose={() => {}} /> };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete navigator.connection;
});

it("offers deletion in an editable transaction modal but not in a new transaction", () => {
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const transaction = { id: "t1", type: "expense", amount: 12, description: "Coffee", category: "altro", date: new Date() };
  const view = render(<TransactionModal show onClose={onClose} transaction={transaction} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: "transactions.actions.delete" }));
  expect(onDelete).toHaveBeenCalledTimes(1);

  view.rerender(<TransactionModal show onClose={onClose} onDelete={onDelete} />);
  expect(screen.queryByRole("button", { name: "transactions.actions.delete" })).not.toBeInTheDocument();
});

it("focuses the dialog itself when it opens, so no control shows a focus ring", async () => {
  render(<TransactionModal show onClose={() => {}} />);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  expect(screen.getByRole("radio", { name: "transactionModal.expense" })).not.toHaveFocus();
});

it("reveals the focused field when the form's scrollable area shrinks", () => {
  const observers = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() {}
  });
  let frame;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  render(<TransactionModal show onClose={() => {}} />);
  const description = screen.getByLabelText("transactionModal.description");
  const fields = description.closest(".overflow-y-auto");
  const observer = observers.find((item) => item.target === fields);
  expect(observer).toBeDefined();
  vi.spyOn(fields, "getBoundingClientRect").mockReturnValue({ top: 100 });
  vi.spyOn(description, "getBoundingClientRect").mockReturnValue({ top: 290, bottom: 340 });
  Object.defineProperty(fields, "clientHeight", { value: 200, configurable: true });
  description.focus();
  observer.callback();
  act(() => frame());
  expect(fields.scrollTop).toBe(48);
});

it("waits for the native keyboard to hide before closing the transaction modal", () => {
  vi.stubEnv("MODE", "mobile");
  const onClose = vi.fn();
  render(<TransactionModal show onClose={onClose} />);
  const description = screen.getByLabelText("transactionModal.description");
  description.focus();
  fireEvent(window, new Event("keyboardWillShow"));
  fireEvent.click(screen.getByRole("button", { name: "common.close" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(description).not.toHaveFocus();
  fireEvent(window, new Event("keyboardDidHide"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("keeps the real form mounted and retains values and request ID after a failed save", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectSave;
  mocks.add.mockReturnValueOnce(new Promise((resolve, reject) => { rejectSave = reject; })).mockResolvedValueOnce({});
  window.history.replaceState({}, "", "/profile");
  // Skip the idle-time preloading of every page: those imports would outlive
  // the test and the environment teardown.
  Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
  render(<RouterProvider><UnifiedTransactionProvider><AppRouter /></UnifiedTransactionProvider></RouterProvider>);
  const amount = await screen.findByLabelText("transactionModal.amount", {}, { timeout: 5000 });
  const description = screen.getByLabelText("transactionModal.description");
  fireEvent.change(amount, { target: { value: "12.50" } });
  fireEvent.change(description, { target: { value: "Pranzo" } });
  fireEvent.submit(amount.closest("form"));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("transactionModal.amount")).toBe(amount);
  expect(description).toHaveValue("Pranzo");
  await act(async () => { rejectSave(new Error("offline")); });
  expect(screen.getByLabelText("transactionModal.amount")).toBe(amount);
  expect(amount).toHaveValue("12.50");
  expect(description).toHaveValue("Pranzo");
  fireEvent.submit(amount.closest("form"));
  await waitFor(() => expect(mocks.notification.success).toHaveBeenCalled());
  expect(mocks.add.mock.calls[1][2].requestId).toBe(mocks.add.mock.calls[0][2].requestId);
});
