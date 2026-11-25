import { afterEach, describe, expect, it, vi } from "vitest";
import { toInAppPath } from "../src/platform/deepLinks.js";
import { parseQuickAddSearch } from "../src/utils/quickAddDraft.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("universal link paths", () => {
  it("maps a link on the public domain to an in-app route", () => {
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "https://ducat.app/");
    expect(toInAppPath("https://ducat.app/reset-password#access_token=abc&type=recovery")).toBe(
      "/reset-password#access_token=abc&type=recovery"
    );
    expect(toInAppPath("https://ducat.app/verify-email?email=a%40b.it")).toBe("/verify-email?email=a%40b.it");
    expect(toInAppPath("https://ducat.app")).toBe("/");
  });

  it("accepts the custom scheme used as a fallback", () => {
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "https://ducat.app/");
    expect(toInAppPath("ducat://dashboard")).toBe("/dashboard");
    expect(toInAppPath("ducat:///profile")).toBe("/profile");
  });

  it("ignores links for other hosts and other protocols", () => {
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "https://ducat.app/");
    expect(toInAppPath("https://evil.example/reset-password")).toBeNull();
    expect(toInAppPath("javascript:alert(1)")).toBeNull();
    expect(toInAppPath("mailto:hi@example.com")).toBeNull();
    expect(toInAppPath("not a url")).toBeNull();
    expect(toInAppPath(null)).toBeNull();
  });

  it("ignores http links when no public domain is configured", () => {
    vi.stubEnv("VITE_DESKTOP_WEB_URL", "");
    expect(toInAppPath("https://ducat.app/dashboard")).toBeNull();
    expect(toInAppPath("ducat://dashboard")).toBe("/dashboard");
  });

  it("defaults to ducatapp.com and www.ducatapp.com when VITE_DESKTOP_WEB_URL is unset", () => {
    vi.stubEnv("VITE_DESKTOP_WEB_URL", undefined);
    expect(toInAppPath("https://ducatapp.com/reset-password#type=recovery")).toBe("/reset-password#type=recovery");
    expect(toInAppPath("https://www.ducatapp.com/verify-email")).toBe("/verify-email");
    expect(toInAppPath("https://evil.example/dashboard")).toBeNull();
  });

  it("maps quick-add shortcut deep links to prefilled dashboard routes", () => {
    const mapped = toInAppPath("ducat://quick-add?type=expense&amount=12,50&desc=Pranzo&category=alimentazione");
    expect(mapped).toBe("/dashboard?quickAdd=1&type=expense&amount=12%2C50&description=Pranzo&category=alimentazione");
    const search = mapped.slice(mapped.indexOf("?"));
    expect(parseQuickAddSearch(search)).toEqual({
      type: "expense",
      amount: "12,50",
      description: "Pranzo",
      category: "alimentazione",
    });
    expect(parseQuickAddSearch("")).toBeNull();
  });
});
