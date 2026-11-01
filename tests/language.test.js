import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectLanguage, LANGUAGE_STORAGE_KEY, persistLanguage } from "../src/utils/language.js";

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
    const { changeAppLanguage, default: i18n } = await import("../src/utils/i18n.jsx");
    await changeAppLanguage("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(i18n.t("dashboard.income")).toBe("Income");
    await changeAppLanguage("it");
    expect(i18n.t("dashboard.income")).toBe("Entrate");
  });
});
