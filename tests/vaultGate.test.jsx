import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: { uid: "00000000-0000-4000-8000-0000000000cc", emailVerified: true },
  logout: vi.fn(),
  notification: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  status: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  loadVaultAccount: vi.fn(),
  readCachedVaultAccount: vi.fn(),
  openVault: vi.fn(),
  watchVaultAccount: vi.fn(() => () => {}),
  loadVaultPin: vi.fn(),
  resumeVaultDeviceSession: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock("../src/context/AuthProvider.jsx", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, logout: mocks.logout }),
}));
vi.mock("../src/utils/notificationUtils.jsx", () => ({
  useNotification: () => mocks.notification,
}));
vi.mock("../src/platform/authStorage.js", () => ({
  archiveKeychain: {
    status: mocks.status,
    get: mocks.get,
    set: mocks.set,
    remove: mocks.remove,
  },
}));
vi.mock("../src/services/vaultService.js", () => ({
  loadVaultAccount: mocks.loadVaultAccount,
  readCachedVaultAccount: mocks.readCachedVaultAccount,
  openVault: mocks.openVault,
  startVault: vi.fn(),
  vaultAuthSession: vi.fn(),
  watchVaultAccount: mocks.watchVaultAccount,
}));
vi.mock("../src/utils/vaultDeviceUnlock.js", () => ({
  clearVaultDeviceSession: vi.fn(() => Promise.resolve()),
  isVaultPinLocked: () => false,
  loadVaultPin: mocks.loadVaultPin,
  rememberVaultDeviceSession: vi.fn(() => Promise.resolve()),
  resumeVaultDeviceSession: mocks.resumeVaultDeviceSession,
  resumePairedVaultSession: vi.fn(() => Promise.resolve(null)),
  saveVaultPin: vi.fn(),
  verifyVaultPin: vi.fn(),
}));
vi.mock("../src/services/vaultQueue.js", () => ({
  hasLegacyVaultQueue: () => false,
  runVaultQueue: vi.fn(),
}));
vi.mock("../src/utils/offlineCache.js", () => ({
  clearOfflineForUser: vi.fn(),
}));

import VaultGate from "../src/components/Auth/VaultGate.jsx";
import { setCurrentVault } from "../src/services/vaultSession.js";

const KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const ACCOUNT = { active: true, revision: 1, keys: { v: 2, recovery: "abc" } };

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentVault(null);
  mocks.loadVaultAccount.mockResolvedValue(ACCOUNT);
  mocks.readCachedVaultAccount.mockResolvedValue(null);
  mocks.loadVaultPin.mockResolvedValue(null);
  mocks.openVault.mockResolvedValue({
    uid: mocks.currentUser.uid,
    initialize: vi.fn(() => Promise.resolve()),
    migrate: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  setCurrentVault(null);
});

describe("VaultGate", () => {
  it("opens automatically without prompting when a silent keychain entry is configured", async () => {
    mocks.status.mockResolvedValue({ available: true, configured: true, requiresPrompt: false });
    mocks.get.mockResolvedValue(KEY_B64);

    render(<VaultGate><div>Unlocked content</div></VaultGate>);

    expect(await screen.findByText("Unlocked content")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(mocks.currentUser.uid, "vault.deviceReason");
    expect(screen.queryByRole("button", { name: "vault.unlockWithDevice" })).toBeNull();
  });

  it("opens immediately from the cached archive metadata without showing the archive card", async () => {
    const initialize = vi.fn(() => Promise.resolve());
    mocks.openVault.mockResolvedValueOnce({
      uid: mocks.currentUser.uid,
      initialize,
      migrate: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
    });
    mocks.readCachedVaultAccount.mockResolvedValue(ACCOUNT);
    mocks.status.mockResolvedValue({ available: true, configured: true, requiresPrompt: false });
    mocks.get.mockResolvedValue(KEY_B64);

    render(<VaultGate><div>Unlocked content</div></VaultGate>);
    expect(screen.queryByText("vault.title")).toBeNull();

    expect(await screen.findByText("Unlocked content")).toBeInTheDocument();
    expect(mocks.loadVaultAccount).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledWith(ACCOUNT, { fast: true });
  });

  it("waits for one confirmation when migrating a legacy prompt-protected keychain entry", async () => {
    mocks.status.mockResolvedValue({ available: true, configured: true, requiresPrompt: true });
    mocks.get.mockResolvedValue(KEY_B64);

    render(<VaultGate><div>Unlocked content</div></VaultGate>);

    const button = await screen.findByRole("button", { name: "vault.unlockWithDevice" });
    expect(mocks.get).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("Unlocked content")).toBeInTheDocument());
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
