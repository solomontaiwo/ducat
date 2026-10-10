/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
const directive = (name) => policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";

describe("Content Security Policy", () => {
  it("allows the Supabase API and Realtime endpoints", () => {
    expect(directive("connect-src")).toContain("https://*.supabase.co");
    expect(directive("connect-src")).toContain("wss://*.supabase.co");
  });

  it("no longer allows the Firebase and reCAPTCHA origins", () => {
    expect(policy).not.toMatch(/googleapis|firebase|recaptcha|gstatic|cloudfunctions/);
  });

  it("stays restrictive for everything else", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(directive("frame-src")).toBe("frame-src 'none'");
  });
});
