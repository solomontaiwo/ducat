import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pluginMocks = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => ({ available: true, biometryType: "faceID" })),
  authenticate: vi.fn(async () => ({ authenticated: true })),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => pluginMocks,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => (options && Object.keys(options).length ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

import {
  authenticateBiometric,
  checkBiometricAvailability,
  isBiometricLockEnabled,
  resetBiometricsForTests,
  setBiometricLockEnabled,
} from "../src/platform/biometrics.js";
import { LOCK_GRACE_MS, PrivacyProvider, usePrivacy } from "../src/context/PrivacyProvider.jsx";
import AppLockOverlay from "../src/components/Layout/AppLockOverlay.jsx";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("privacy-masked");
  vi.clearAllMocks();
  resetBiometricsForTests();
  pluginMocks.isAvailable.mockResolvedValue({ available: true, biometryType: "faceID" });
  pluginMocks.authenticate.mockResolvedValue({ authenticated: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("biometrics bridge", () => {
  it("is a safe no-op outside the mobile shell", async () => {
    vi.stubEnv("MODE", "production");
    await expect(checkBiometricAvailability()).resolves.toEqual({ available: false, biometryType: "none", systemAppLock: false });
    await expect(authenticateBiometric("Unlock")).resolves.toEqual({ authenticated: false, errorCode: "notAvailable" });
    setBiometricLockEnabled(true);
    expect(isBiometricLockEnabled()).toBe(false);
  });

  it("queries and authenticates through the native iOS plugin on mobile", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(checkBiometricAvailability()).resolves.toEqual({ available: true, biometryType: "faceID", systemAppLock: false });
    pluginMocks.isAvailable.mockResolvedValueOnce({ available: true, biometryType: "touchID", systemAppLock: true });
    await expect(checkBiometricAvailability()).resolves.toEqual({ available: true, biometryType: "touchID", systemAppLock: true });
    await expect(authenticateBiometric("Unlock Ducat")).resolves.toEqual({ authenticated: true });
    expect(pluginMocks.authenticate).toHaveBeenCalledWith({ reason: "Unlock Ducat" });

    pluginMocks.authenticate.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { code: "userCancel" }));
    await expect(authenticateBiometric("Unlock Ducat")).resolves.toEqual({ authenticated: false, errorCode: "userCancel" });
  });
});

describe("PrivacyProvider & AppLockOverlay", () => {
  it("toggles privacy mode, persists it and updates the root class", () => {
    const { result } = renderHook(() => usePrivacy(), { wrapper: PrivacyProvider });
    expect(result.current.hideAmounts).toBe(false);
    expect(document.documentElement.classList.contains("privacy-masked")).toBe(false);

    act(() => result.current.toggleHideAmounts());
    expect(result.current.hideAmounts).toBe(true);
    expect(document.documentElement.classList.contains("privacy-masked")).toBe(true);
    expect(localStorage.getItem("ducat-hide-amounts")).toBe("true");

    act(() => result.current.setHideAmounts(false));
    expect(result.current.hideAmounts).toBe(false);
    expect(document.documentElement.classList.contains("privacy-masked")).toBe(false);
    expect(localStorage.getItem("ducat-hide-amounts")).toBeNull();
  });

  it("locks on mobile startup when enabled, unlocks via Face ID and re-locks only after the grace period", async () => {
    vi.stubEnv("MODE", "mobile");
    setBiometricLockEnabled(true);
    let resolveAuth;
    pluginMocks.authenticate.mockReturnValueOnce(new Promise((done) => { resolveAuth = done; }));

    render(
      <PrivacyProvider>
        <AppLockOverlay />
      </PrivacyProvider>
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(pluginMocks.authenticate).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveAuth({ authenticated: true });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(pluginMocks.isAvailable).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("ducat-biometric-lock")).toBe("true");

    // Short background transition (< grace period, e.g. share sheet) must not re-lock.
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);
    act(() => { window.dispatchEvent(new Event("ducat:app-inactive")); });
    nowSpy.mockReturnValue(10_000 + LOCK_GRACE_MS - 1_000);
    act(() => { window.dispatchEvent(new Event("ducat:app-active")); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Long background transition (>= grace period) re-locks and prompts again.
    pluginMocks.authenticate.mockResolvedValueOnce({ authenticated: false });
    nowSpy.mockReturnValue(20_000);
    act(() => { window.dispatchEvent(new Event("ducat:app-inactive")); });
    nowSpy.mockReturnValue(20_000 + LOCK_GRACE_MS + 500);
    act(() => { window.dispatchEvent(new Event("ducat:app-active")); });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Tapping the unlock button retries Face ID and clears the overlay.
    pluginMocks.authenticate.mockResolvedValueOnce({ authenticated: true });
    fireEvent.click(screen.getByRole("button", { name: /privacy\.biometric\.unlockWith/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    nowSpy.mockRestore();
  });
});
