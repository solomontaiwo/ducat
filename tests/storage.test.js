import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../src/utils/storage.js";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

beforeEach(() => {
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, String(value))),
      removeItem: vi.fn((key) => values.delete(key)),
    },
  });
});

afterEach(() => {
  if (originalStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", originalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
});

describe("safe local storage", () => {
  it("reads, writes and removes values", () => {
    expect(writeLocalValue("test-key", "value")).toBe(true);
    expect(readLocalValue("test-key")).toBe("value");
    expect(removeLocalValue("test-key")).toBe(true);
    expect(readLocalValue("test-key", "fallback")).toBe("fallback");
  });

  it("falls back when browser storage is unavailable", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => { throw new Error("blocked"); }),
        setItem: vi.fn(() => { throw new Error("quota"); }),
        removeItem: vi.fn(() => { throw new Error("blocked"); }),
      },
    });
    expect(readLocalValue("key", "fallback")).toBe("fallback");
    expect(writeLocalValue("key", "value")).toBe(false);
    expect(removeLocalValue("key")).toBe(false);
  });
});
