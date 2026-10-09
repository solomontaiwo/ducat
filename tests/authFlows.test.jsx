/* eslint-disable react/prop-types */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  auth: { currentUser: null },
  signIn: vi.fn(),
  createUser: vi.fn(),
  updateProfile: vi.fn(),
  sendVerification: vi.fn(),
  sendReset: vi.fn(),
  setDoc: vi.fn(),
  refreshCurrentUser: vi.fn(),
  logout: vi.fn(),
  currentUser: { email: "ada@example.com" },
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key, values) => (values ? `${key}|${JSON.stringify(values)}` : key) }) }));
vi.mock("react-responsive", () => ({ useMediaQuery: () => false }));
vi.mock("../src/router/RouterProvider.jsx", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));
vi.mock("../src/utils/notificationUtils", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/utils/notificationUtils.jsx", () => ({ useNotification: () => mocks.notification }));
vi.mock("../src/utils/firebaseAuth", () => ({ auth: mocks.auth }));
vi.mock("../src/utils/firebaseFirestore", () => ({ firestore: {} }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  createUserWithEmailAndPassword: mocks.createUser,
  updateProfile: mocks.updateProfile,
  sendEmailVerification: mocks.sendVerification,
  sendPasswordResetEmail: mocks.sendReset,
}));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => "ref"), setDoc: mocks.setDoc, serverTimestamp: () => "TS" }));
vi.mock("../src/context/AuthProvider", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, refreshCurrentUser: mocks.refreshCurrentUser, logout: mocks.logout }),
}));

import Login from "../src/components/Auth/Login.jsx";
import Register from "../src/components/Auth/Register.jsx";
import ForgotPassword from "../src/components/Auth/ForgotPassword.jsx";
import VerifyEmail from "../src/components/Auth/VerifyEmail.jsx";

const fill = (label, value) => fireEvent.change(document.getElementById(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Login", () => {
  const submit = () => fireEvent.submit(document.querySelector("form"));

  it("normalizes the email and sends verified users to the dashboard", async () => {
    mocks.signIn.mockResolvedValue({ user: { emailVerified: true } });
    render(<Login />);
    fill("email", "  Ada@Example.COM ");
    fill("password", "secret-pass");
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mocks.signIn).toHaveBeenCalledWith(mocks.auth, "ada@example.com", "secret-pass");
  });

  it("sends unverified users to the verification page", async () => {
    mocks.signIn.mockResolvedValue({ user: { emailVerified: false } });
    render(<Login />);
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
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

  it("blocks mismatching passwords before any Firebase call", async () => {
    render(<Register />);
    fillAll({ confirmPassword: "different" });
    expect(await screen.findByText("validation.passwordMismatch")).toBeInTheDocument();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("creates the account, profile and verification email, then goes to verification", async () => {
    const user = { uid: "u1", email: "ada@example.com" };
    mocks.createUser.mockResolvedValue({ user });
    render(<Register />);
    fillAll();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
    expect(mocks.createUser).toHaveBeenCalledWith(mocks.auth, "ada@example.com", "long-enough-1");
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: "Ada Lovelace" });
    expect(mocks.setDoc).toHaveBeenCalledWith("ref", expect.objectContaining({ username: "Ada Lovelace", displayName: "Ada Lovelace", email: "ada@example.com" }));
    expect(mocks.sendVerification).toHaveBeenCalledWith(user);
  });

  it("does not fail registration when the verification email cannot be sent", async () => {
    mocks.createUser.mockResolvedValue({ user: { uid: "u1", email: "ada@example.com" } });
    mocks.sendVerification.mockRejectedValue(new Error("quota"));
    render(<Register />);
    fillAll();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
    expect(mocks.notification.success).toHaveBeenCalled();
  });

  it("recovers when the account exists but the profile write fails", async () => {
    mocks.createUser.mockResolvedValue({ user: { uid: "u1", email: "ada@example.com" } });
    mocks.setDoc.mockRejectedValue(new Error("rules"));
    render(<Register />);
    fillAll();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/verify-email", { replace: true }));
    expect(mocks.notification.warning).toHaveBeenCalledWith("auth.profileIncomplete");
  });

  it("shows a translated message for an address already in use", async () => {
    mocks.createUser.mockRejectedValue(Object.assign(new Error("raw"), { code: "auth/email-already-in-use" }));
    render(<Register />);
    fillAll();
    expect(await screen.findByText("errors.emailAlreadyInUse")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("ForgotPassword", () => {
  it.each([
    ["succeeds", () => mocks.sendReset.mockResolvedValue()],
    ["fails", () => mocks.sendReset.mockRejectedValue(Object.assign(new Error("nope"), { code: "auth/user-not-found" }))],
  ])("shows the same neutral confirmation when the request %s", async (_label, arrange) => {
    arrange();
    render(<ForgotPassword />);
    fill("reset-email", " Ada@Example.com ");
    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText("auth.forgotPassword.sent")).toBeInTheDocument();
    expect(mocks.sendReset).toHaveBeenCalledWith(mocks.auth, "ada@example.com");
  });
});

describe("VerifyEmail", () => {
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
    mocks.sendVerification.mockResolvedValue();
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.resend" }));
    await waitFor(() => expect(mocks.notification.success).toHaveBeenCalledWith("auth.verifyEmail.sent"));
    const locked = await screen.findByRole("button", { name: /auth\.verifyEmail\.resendIn/ });
    expect(locked).toBeDisabled();
    expect(mocks.sendVerification).toHaveBeenCalledTimes(1);
  });

  it("explains rate limiting and supports signing out", async () => {
    mocks.sendVerification.mockRejectedValue(Object.assign(new Error("rate"), { code: "auth/too-many-requests" }));
    mocks.logout.mockResolvedValue();
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.resend" }));
    await waitFor(() => expect(mocks.notification.error).toHaveBeenCalledWith("auth.verifyEmail.tooManyRequests"));
    fireEvent.click(screen.getByRole("button", { name: "auth.verifyEmail.exit" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(mocks.logout).toHaveBeenCalled();
  });
});
