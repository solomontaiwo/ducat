import { afterEach, describe, expect, it, vi } from "vitest";
import { toInAppPath } from "../src/platform/deepLinks.js";

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
});
