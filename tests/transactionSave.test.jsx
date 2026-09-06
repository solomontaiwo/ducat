import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UnifiedTransactionProvider } from "../src/context/UnifiedTransactionProvider.jsx";
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

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps the real form mounted and retains values and request ID after a failed save", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectSave;
  mocks.add.mockReturnValueOnce(new Promise((resolve, reject) => { rejectSave = reject; })).mockResolvedValueOnce({});
  window.history.replaceState({}, "", "/profile");
  render(<RouterProvider><UnifiedTransactionProvider><AppRouter /></UnifiedTransactionProvider></RouterProvider>);
  const amount = await screen.findByLabelText("transactionModal.amount");
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
