import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });

// The account currency lives in a module, like the money language: start
// every test from the euro default.
import { afterEach } from "vitest";
import { setAccountCurrency } from "../src/utils/currency.js";

afterEach(() => setAccountCurrency("EUR"));
