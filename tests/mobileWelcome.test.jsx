/* eslint-disable react/prop-types */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  startDemo: vi.fn(),
  currentUser: null,
  isDemo: false,
  t: (key) => key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { language: "it" } }),
}));
vi.mock("../src/router/RouterProvider", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("../src/context/AuthProvider.jsx", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, loading: false }),
}));
vi.mock("../src/context/UnifiedTransactionProvider.jsx", () => ({
  useUnifiedTransactions: () => ({ isDemo: mocks.isDemo, loading: false, startDemo: mocks.startDemo }),
}));
vi.mock("../src/platform/haptics.js", () => ({
  hapticTap: vi.fn(async () => true),
  hapticSuccess: vi.fn(async () => true),
}));

import Home from "../src/components/Home/Home.jsx";
import MobileWelcome from "../src/components/Home/MobileWelcome.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = null;
  mocks.isDemo = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Home shell selection", () => {
  it("shows the compact MobileWelcome on iOS mobile builds", async () => {
    vi.stubEnv("MODE", "mobile");
    render(<Home />);
    expect(await screen.findByRole("heading", { level: 1, name: "mobileWelcome.slides.fast.title" })).toBeInTheDocument();
  });

  it("keeps the full web LandingPage on web builds", () => {
    vi.stubEnv("MODE", "production");
    render(<Home />);
    expect(screen.getByText("landing.badge")).toBeInTheDocument();
  });
});

describe("MobileWelcome", () => {
  it("cycles through highlights and routes to register, login and demo", async () => {
    render(<MobileWelcome />);

    expect(screen.getByRole("heading", { level: 1, name: "mobileWelcome.slides.fast.title" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mobileWelcome.next" }));
    expect(screen.getByRole("heading", { level: 1, name: "mobileWelcome.slides.plan.title" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "mobileWelcome.slides.private.title" }));
    expect(screen.getByRole("heading", { level: 1, name: "mobileWelcome.slides.private.title" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "landing.register" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/register");

    fireEvent.click(screen.getByRole("button", { name: "landing.login" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/login");

    fireEvent.click(screen.getByRole("button", { name: "mobileWelcome.tryDemo" }));
    await waitFor(() => expect(mocks.startDemo).toHaveBeenCalledOnce());
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard");
  });
});
