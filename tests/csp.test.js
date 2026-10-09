/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
const directive = (name) => policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";

describe("Content Security Policy", () => {
  it("allows the callable Cloud Functions endpoint used by account deletion", () => {
    expect(directive("connect-src")).toContain("https://*.cloudfunctions.net");
  });

  it("allows the reCAPTCHA origins required by App Check", () => {
    expect(directive("script-src")).toContain("https://www.google.com/recaptcha/");
    expect(directive("frame-src")).toContain("https://www.google.com/recaptcha/");
    expect(directive("connect-src")).toContain("https://www.google.com/recaptcha/");
  });

  it("stays restrictive for everything else", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });
});
