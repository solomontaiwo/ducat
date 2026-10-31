/* eslint-disable react/prop-types */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  sendReset: vi.fn(),
  updatePassword: vi.fn(),
  refreshCurrentUser: vi.fn(),
  logout: vi.fn(),
  markPendingVerification: vi.fn(),
  currentUser: { email: "ada@example.com" },
  authLoading: false,
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key, values) => (values ? `${key}|${JSON.stringify(values)}` : key) }) }));
vi.mock("react-responsive", () => ({ useMediaQuery: () => false }));
vi.mock("../src/router/RouterProvider", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));
vi.mock("../src/utils/notificationUtils", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/services/authService.js", () => ({
  signIn: mocks.signIn,
  signUp: mocks.signUp,
  resendVerificationEmail: mocks.resend,
  sendPasswordReset: mocks.sendReset,
  updatePassword: mocks.updatePassword,
}));
vi.mock("../src/context/AuthProvider", () => ({
  useAuth: () => ({
    currentUser: mocks.currentUser,
    loading: mocks.authLoading,
    refreshCurrentUser: mocks.refreshCurrentUser,
    logout: mocks.logout,
    markPendingVerification: mocks.markPendingVerification,
  }),
}));

import Login from "../src/components/Auth/Login.jsx";
import Register from "../src/components/Auth/Register.jsx";
import ForgotPassword from "../src/components/Auth/ForgotPassword.jsx";
import VerifyEmail from "../src/components/Auth/VerifyEmail.jsx";
import ResetPassword from "../src/components/Auth/ResetPassword.jsx";

const fill = (label, value) => fireEvent.change(document.getElementById(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = { email: "ada@example.com" };
  mocks.authLoading = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Login", () => {
  const submit = () => fireEvent.submit(document.querySelector("form"));

  it("signs in and sends verified users to the dashboard", async () => {
    mocks.signIn.mockResolvedValue({ uid: "u1", emailVerified: true });
    render(<Login />);
    fill("email", "  Ada@Example.COM ");
    fill("password", "secret-pass");
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mocks.signIn).toHaveBeenCalledWith("Ada@Example.COM", "secret-pass");
  });

  it("sends accounts waiting for the email confirmation to the verification page", async () => {
    mocks.signIn.mockRejectedValue(Object.assign(new Error("Email not confirmed"), { code: "auth/email-not-verified" }));
    render(<Login />);
    fill("email", "ada@example.com");
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
    expect(mocks.markPendingVerification).toHaveBeenCalledWith("ada@example.com");
  });

  it.each([
    ["auth/invalid-credential", "errors.invalidCredentials"],
    ["auth/too-many-requests", "errors.tooManyRequests"],
    ["auth/invalid-email", "errors.invalidEmail"],
  ])("shows a translated message for %s without navigating", async (code, expected) => {
    mocks.signIn.mockRejectedValue(Object.assign(new Error("raw"), { code }));
    render(<Login />);
    submit();
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("toggles password visibility with an accessible label", () => {
    render(<Login />);
    const toggle = screen.getByRole("button", { name: "auth.showPassword" });
    fireEvent.click(toggle);
    expect(document.getElementById("password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "auth.hidePassword" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Register", () => {
  const fillAll = (overrides = {}) => {
    const values = { username: "Ada Lovelace", email: "Ada@Example.com", password: "long-enough-1", confirmPassword: "long-enough-1", ...overrides };
    const ids = { username: "username", email: "email", password: "password", confirmPassword: "confirm" };
    Object.entries(values).forEach(([key, value]) => fill(ids[key], value));
    fireEvent.submit(document.querySelector("form"));
  };

  it("blocks mismatching passwords before any request", async () => {
    render(<Register />);
    fillAll({ confirmPassword: "different" });
    expect(await screen.findByText("validation.passwordMismatch")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("creates the account with the chosen name, then waits for the email confirmation", async () => {
    mocks.signUp.mockResolvedValue({ user: { uid: "u1", emailVerified: false }, hasSession: false });
    render(<Register />);
    fillAll();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "ada@example.com", password: "long-enough-1", displayName: "Ada Lovelace" });
    expect(mocks.markPendingVerification).toHaveBeenCalledWith("ada@example.com");
    expect(mocks.notification.success).toHaveBeenCalled();
  });

  it("goes straight to the dashboard when confirmation is not required", async () => {
    mocks.signUp.mockResolvedValue({ user: { uid: "u1", emailVerified: true }, hasSession: true });
    render(<Register />);
    fillAll();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mocks.markPendingVerification).not.toHaveBeenCalled();
  });

  it("shows a translated message for an address already in use", async () => {
    mocks.signUp.mockRejectedValue(Object.assign(new Error("raw"), { code: "auth/email-already-in-use" }));
    render(<Register />);
    fillAll();
    expect(await screen.findByText("errors.emailAlreadyInUse")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("ForgotPassword", () => {
  it("explains that desktop password reset continues in the browser", async () => {
    vi.stubEnv("MODE", "desktop");
    mocks.sendReset.mockResolvedValue();
    render(<ForgotPassword />);
    fill("reset-email", "ada@example.com");
    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText("auth.forgotPassword.desktopHint")).toBeInTheDocument();
  });

  it.each([
    ["succeeds", () => mocks.sendReset.mockResolvedValue()],
    ["fails", () => mocks.sendReset.mockRejectedValue(Object.assign(new Error("nope"), { code: "auth/user-not-found" }))],
  ])("shows the same neutral confirmation when the request %s", async (_label, arrange) => {
    arrange();
    render(<ForgotPassword />);
    fill("reset-email", " Ada@Example.com ");
    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText("auth.forgotPassword.sent")).toBeInTheDocument();
    expect(mocks.sendReset).toHaveBeenCalledWith("Ada@Example.com");
  });
});

describe("VerifyEmail", () => {
  it("lets a pending desktop user return to sign in after confirming in a browser", async () => {
    vi.stubEnv("MODE", "desktop");
    mocks.currentUser = { email: "ada@example.com", pending: true };
    mocks.logout.mockResolvedValue();
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.desktopLogin" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true }));
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("navigates to the dashboard once the email is verified", async () => {
    mocks.refreshCurrentUser.mockResolvedValue({ emailVerified: true });
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.check" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });

  it("informs the user when verification is still pending", async () => {
    mocks.refreshCurrentUser.mockResolvedValue({ emailVerified: false });
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.check" }));
    await waitFor(() => expect(mocks.notification.info).toHaveBeenCalledWith("auth.verifyEmail.notVerified"));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("reports a failed check", async () => {
    mocks.refreshCurrentUser.mockRejectedValue(new Error("network"));
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.check" }));
    await waitFor(() => expect(mocks.notification.error).toHaveBeenCalledWith("auth.verifyEmail.checkFailed"));
  });

  it("resends once, then locks the button during the cooldown", async () => {
    mocks.resend.mockResolvedValue();
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.resend" }));
    await waitFor(() => expect(mocks.notification.success).toHaveBeenCalledWith("auth.verifyEmail.sent"));
    const locked = await screen.findByRole("button", { name: /auth\.verifyEmail\.resendIn/ });
    expect(locked).toBeDisabled();
    expect(mocks.resend).toHaveBeenCalledTimes(1);
    expect(mocks.resend).toHaveBeenCalledWith("ada@example.com");
  });

  it("explains rate limiting and supports signing out", async () => {
    mocks.resend.mockRejectedValue(Object.assign(new Error("rate"), { code: "auth/too-many-requests" }));
    mocks.logout.mockResolvedValue();
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.resend" }));
    await waitFor(() => expect(mocks.notification.error).toHaveBeenCalledWith("auth.verifyEmail.tooManyRequests"));
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.exit" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(mocks.logout).toHaveBeenCalled();
  });
});

describe("ResetPassword", () => {
  const submit = () => fireEvent.submit(document.querySelector("form"));

  it("explains an invalid or expired link when there is no session", () => {
    mocks.currentUser = null;
    render(<ResetPassword />);
    expect(screen.getByText("auth.resetPassword.invalidLink")).toBeInTheDocument();
    expect(screen.getByText("auth.resetPassword.requestNew")).toHaveAttribute("href", "/forgot-password");
    expect(document.querySelector("form")).toBeNull();
  });

  it("validates, saves the new password and opens the app", async () => {
    mocks.currentUser = { uid: "u1", email: "ada@example.com", emailVerified: true };
    mocks.updatePassword.mockResolvedValue();
    render(<ResetPassword />);
    fill("new-password", "short");
    fill("confirm-new-password", "short");
    submit();
    expect(await screen.findByText("validation.passwordMin")).toBeInTheDocument();
    fill("new-password", "long-enough-1");
    fill("confirm-new-password", "long-enough-2");
    submit();
    expect(await screen.findByText("validation.passwordMismatch")).toBeInTheDocument();
    fill("confirm-new-password", "long-enough-1");
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mocks.updatePassword).toHaveBeenCalledWith("long-enough-1");
  });

  it("explains when the new password equals the old one", async () => {
    mocks.currentUser = { uid: "u1", email: "ada@example.com", emailVerified: true };
    mocks.updatePassword.mockRejectedValue(Object.assign(new Error("same"), { code: "auth/same-password" }));
    render(<ResetPassword />);
    fill("new-password", "long-enough-1");
    fill("confirm-new-password", "long-enough-1");
    submit();
    expect(await screen.findByText("auth.resetPassword.samePassword")).toBeInTheDocument();
  });
});
