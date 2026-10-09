import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../src/components/ErrorBoundary.jsx";
import {
  buildErrorReport,
  installGlobalErrorReporting,
  reportError,
  resetErrorReportingForTests,
  scrubText,
} from "../src/utils/errorReporting.js";

describe("scrubText", () => {
  it("removes emails, URL query strings and long numbers", () => {
    const text = scrubText("fail for ada@example.com at https://x.test/page?token=abc#h with 1234567890");
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("token=abc");
    expect(text).not.toContain("1234567890");
    expect(text).toContain("https://x.test/page");
  });

  it("bounds the length", () => {
    expect(scrubText("a".repeat(5000)).length).toBe(1500);
  });
});

describe("reportError", () => {
  const beacon = vi.fn(() => true);

  beforeEach(() => {
    resetErrorReportingForTests();
    beacon.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true, writable: true });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("only logs locally when no endpoint is configured", () => {
    vi.stubEnv("VITE_ERROR_REPORT_URL", "");
    expect(reportError(new Error("boom"), { source: "test" })).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("sends a scrubbed report without user identifiers", () => {
    vi.stubEnv("VITE_ERROR_REPORT_URL", "https://reports.example.test/ingest");
    expect(reportError(new Error("failed for ada@example.com"), { source: "test" })).toBe(true);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe("https://reports.example.test/ingest");
    expect(blob).toBeInstanceOf(Blob);
    const report = buildErrorReport(new Error("failed for ada@example.com"), { source: "test" });
    expect(JSON.stringify(report)).not.toContain("ada@example.com");
    expect(Object.keys(report)).not.toContain("uid");
  });

  it("de-duplicates identical errors and caps reports per session", () => {
    vi.stubEnv("VITE_ERROR_REPORT_URL", "https://reports.example.test/ingest");
    expect(reportError(new Error("same"), { source: "a" })).toBe(true);
    expect(reportError(new Error("same"), { source: "a" })).toBe(false);
    for (let index = 0; index < 10; index += 1) reportError(new Error(`distinct ${index}`), { source: "b" });
    expect(beacon).toHaveBeenCalledTimes(5);
  });

  it("captures window errors and unhandled rejections", () => {
    vi.stubEnv("VITE_ERROR_REPORT_URL", "https://reports.example.test/ingest");
    installGlobalErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("global"), message: "global" }));
    const rejection = new Event("unhandledrejection");
    rejection.reason = new Error("async");
    window.dispatchEvent(rejection);
    expect(beacon).toHaveBeenCalledTimes(2);
  });
});

describe("ErrorBoundary", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("shows a translated, recoverable fallback and reports the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => { throw new Error("render failure"); };
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("renders children when nothing fails", () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
