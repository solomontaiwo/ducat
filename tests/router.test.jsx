import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Link, RouterProvider, normalizeInternalPath, useLocation } from "../src/router/RouterProvider.jsx";
import { resolveRouteAccess } from "../src/router/accessPolicy.js";

const Probe = () => {
  const location = useLocation();
  return <><span data-testid="path">{location.pathname}</span><Link to="/dashboard">Dashboard</Link></>;
};

describe("internal router", () => {
  it("handles basename navigation without a page reload", () => {
    window.history.replaceState({}, "", "/soldi-sotto/login");
    render(<RouterProvider basename="/soldi-sotto"><Probe /></RouterProvider>);
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard");
    expect(window.location.pathname).toBe("/soldi-sotto/dashboard");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil"])("rejects unsafe path %s", (path) => {
    expect(() => normalizeInternalPath(path)).toThrow();
  });
});

describe("route access policy", () => {
  const verified = { emailVerified: true };
  const unverified = { emailVerified: false };

  it.each([
    [{ access: "app", currentUser: null, isDemo: false, pathname: "/dashboard" }, "/login"],
    [{ access: "app", currentUser: unverified, isDemo: false, pathname: "/dashboard" }, "/verify-email"],
    [{ access: "app", currentUser: verified, isDemo: false, pathname: "/dashboard" }, null],
    [{ access: "app", currentUser: null, isDemo: true, pathname: "/dashboard" }, null],
    [{ access: "authenticated", currentUser: null, isDemo: false, pathname: "/profile" }, "/login"],
    [{ access: "public-only", currentUser: verified, isDemo: false, pathname: "/login" }, "/dashboard"],
    [{ access: "authenticated-unverified", currentUser: unverified, isDemo: false, pathname: "/verify-email" }, null],
  ])("resolves %o to %s", (input, expected) => {
    expect(resolveRouteAccess(input)).toBe(expected);
  });
});
