import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, currencyFractionDigits, currencySymbol, getAccountCurrency, isSupportedCurrency,
  notifyAccountCurrency, setAccountCurrency, subscribeAccountCurrency, syncAccountCurrency,
} from "../src/utils/currency.js";
import { CURRENCY_REGIONS, currencyForRegion, currencyName, currencyTokens, deviceCurrency } from "../src/utils/currencyRegions.js";
import { useAccountCurrency } from "../src/hooks/useAccountCurrency.js";
import formatCurrency from "../src/utils/formatCurrency.jsx";

afterEach(cleanup);

describe("supported currencies", () => {
  it("lists the currencies in use, euro first among equals", () => {
    expect(DEFAULT_CURRENCY).toBe("EUR");
    expect(SUPPORTED_CURRENCIES).toEqual([...SUPPORTED_CURRENCIES].sort());
    for (const code of ["EUR", "USD", "GBP", "JPY", "CHF", "INR", "BRL", "XOF"]) expect(isSupportedCurrency(code)).toBe(true);
  });

  it("has a region list for every supported currency and nothing else", () => {
    expect(Object.keys(CURRENCY_REGIONS).sort()).toEqual(SUPPORTED_CURRENCIES);
    const regions = Object.values(CURRENCY_REGIONS).flatMap((value) => value.split(" "));
    expect(new Set(regions).size).toBe(regions.length);
  });

  it.each(["BGN", "HRK", "SLL", "ZWL", "usd", "XYZ", "", null, 978])("rejects %s", (code) => {
    expect(isSupportedCurrency(code)).toBe(false);
  });

  it.each([["IT", "EUR"], ["bg", "EUR"], ["US", "USD"], ["GB", "GBP"], ["JP", "JPY"], ["CH", "CHF"], ["EC", "USD"], ["SN", "XOF"], ["ZZ", null], [undefined, null]])(
    "maps region %s to %s",
    (region, currency) => expect(currencyForRegion(region)).toBe(currency)
  );
});

describe("device currency", () => {
  it.each([
    [["en-GB"], "GBP"],
    [["it-IT", "en-US"], "EUR"],
    [["en-US", "it-IT"], "USD"],
    [["fr-CA"], "CAD"],
    [["ja"], "JPY"],
    [["en", "de-CH"], "CHF"],
    [["@@"], "EUR"],
    [[], "EUR"],
  ])("picks %j → %s", (languages, currency) => {
    expect(deviceCurrency(languages)).toBe(currency);
  });

  it("reads the browser languages by default", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    expect(deviceCurrency()).toBe("BRL");
    vi.restoreAllMocks();
  });
});

describe("currency details", () => {
  it("keeps at most two decimals and none where the currency has none", () => {
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KRW")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(2);
    expect(currencyFractionDigits("XYZ")).toBe(2);
  });

  it("uses the short symbol", () => {
    expect(currencySymbol("USD", "en-GB")).toBe("$");
    expect(currencySymbol("EUR", "it-IT")).toBe("€");
    expect(currencySymbol("JPY", "it-IT")).toBe("¥");
    expect(currencySymbol("CHF", "it-IT")).toBe("CHF");
  });

  it("names currencies in the interface language", () => {
    expect(currencyName("USD", "en")).toBe("US Dollar");
    expect(currencyName("USD", "it")).toBe("Dollaro statunitense");
    expect(currencyName("EUR", "it")).toBe("Euro");
  });

  it("knows every way an amount can be written, longest first", () => {
    expect(currencyTokens("USD")).toEqual(expect.arrayContaining(["USD", "US$", "$"]));
    expect(currencyTokens("EUR")).toEqual(expect.arrayContaining(["EURO", "EUR", "€"]));
    const tokens = currencyTokens("CAD");
    expect(tokens.indexOf("CA$")).toBeLessThan(tokens.indexOf("$"));
  });
});

describe("account currency store", () => {
  it("falls back to euro for unknown codes", () => {
    setAccountCurrency("XYZ");
    expect(getAccountCurrency()).toBe("EUR");
  });

  it("notifies only on change, and syncing alone never notifies", () => {
    const listener = vi.fn();
    const stop = subscribeAccountCurrency(listener);
    setAccountCurrency("USD");
    setAccountCurrency("USD");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(syncAccountCurrency("GBP")).toBe(true);
    expect(syncAccountCurrency("GBP")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    notifyAccountCurrency();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setAccountCurrency("JPY");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("renders subscribed components again when the currency changes", () => {
    const Amount = () => {
      useAccountCurrency();
      return <span>{formatCurrency(1234.5, "en-GB")}</span>;
    };
    render(<Amount />);
    expect(screen.getByText("€1,234.50")).toBeInTheDocument();
    act(() => setAccountCurrency("USD"));
    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
    act(() => setAccountCurrency("JPY"));
    expect(screen.getByText("¥1,235")).toBeInTheDocument();
  });
});
