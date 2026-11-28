import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectLanguage, LANGUAGE_STORAGE_KEY, persistLanguage } from "../src/utils/language.js";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { JSDOM } from "jsdom";

beforeEach(() => {
  window.localStorage.clear();
});

describe("language detection", () => {
  it("prefers the stored choice", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(detectLanguage()).toBe("en");
  });

  it("reads the key used by older versions", () => {
    window.localStorage.setItem("i18nextLng", "it-IT");
    expect(detectLanguage()).toBe("it");
  });

  it("falls back to the browser language", () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-GB"]);
    expect(detectLanguage()).toBe("en");
    vi.restoreAllMocks();
  });

  it("persists a normalised choice and drops the legacy key", () => {
    window.localStorage.setItem("i18nextLng", "it");
    persistLanguage("en-US");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(window.localStorage.getItem("i18nextLng")).toBeNull();
  });
});

describe("i18n resources", () => {
  it("loads English on demand and switches back to Italian", async () => {
    const { default: i18n } = await import("../src/utils/i18n.jsx");
    const { loadEnglish } = await import("../src/utils/loadEnglish.js");
    await loadEnglish(i18n);
    await i18n.changeLanguage("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(i18n.t("dashboard.income")).toBe("Income");
    await i18n.changeLanguage("it");
    expect(i18n.t("dashboard.income")).toBe("Entrate");
  });
});

describe("support page language", () => {
  const html = readFileSync(new NodeURL("../public/support/index.html", import.meta.url), "utf8");
  const openPage = ({ hash = "", saved, browser = "it-IT" } = {}) => new JSDOM(html, {
    url: `https://ducatapp.com/support/${hash}`,
    runScripts: "dangerously",
    beforeParse(window) {
      if (saved) window.localStorage.setItem("appLanguage", saved);
      Object.defineProperty(window.navigator, "languages", { value: [browser] });
    },
  });

  it("uses the browser language when no preference is saved", () => {
    const { window } = openPage({ browser: "en-US" });
    expect(window.document.documentElement.lang).toBe("en");
    expect(window.document.getElementById("english").hidden).toBe(false);
    expect(window.document.getElementById("italiano").hidden).toBe(true);
    window.close();
  });

  it("prefers the saved language and allows an explicit language link", () => {
    const { window } = openPage({ saved: "it", browser: "en-US" });
    expect(window.document.documentElement.lang).toBe("it");
    window.location.hash = "english";
    window.dispatchEvent(new window.Event("hashchange"));
    expect(window.document.documentElement.lang).toBe("en");
    expect(window.document.getElementById("english").hidden).toBe(false);
    expect(window.localStorage.getItem("appLanguage")).toBe("it");
    window.close();
  });
});
