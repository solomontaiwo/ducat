import { describe, expect, it } from "vitest";
import { profileNameSchema, registrationSchema } from "../src/schemas/profile.js";
import { transactionV2InputSchema, transactionV2PatchSchema } from "../src/schemas/transaction.jsx";

describe("profile schemas", () => {
  it("normalizes a valid registration", () => {
    const value = registrationSchema.parse({
      username: "  Mario Rossi  ",
      email: "  MARIO@EXAMPLE.COM ",
      password: "password-secure",
      confirmPassword: "password-secure",
    });
    expect(value.username).toBe("Mario Rossi");
    expect(value.email).toBe("mario@example.com");
  });

  it.each(["  ", "ab", "a".repeat(51)])("rejects invalid profile name length", (name) => {
    expect(profileNameSchema.safeParse(name).success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    expect(registrationSchema.safeParse({
      username: "Mario",
      email: "mario@example.com",
      password: "password-one",
      confirmPassword: "password-two",
    }).success).toBe(false);
  });
});

describe("transaction schemas", () => {
  const valid = {
    amountMinor: 1234,
    currency: "EUR",
    description: "Pranzo",
    dateKey: "2026-08-04",
    category: "alimentazione",
    type: "expense",
  };

  it("accepts a complete v2 transaction", () => {
    expect(transactionV2InputSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    { amountMinor: 0 },
    { amountMinor: 1.5 },
    { currency: "USD" },
    { dateKey: "2026-02-31" },
    { description: "" },
    { type: "transfer" },
  ])("rejects invalid v2 fields: %o", (override) => {
    expect(transactionV2InputSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("requires a non-empty update patch", () => {
    expect(transactionV2PatchSchema.safeParse({}).success).toBe(false);
    expect(transactionV2PatchSchema.safeParse({ description: "Cena" }).success).toBe(true);
  });
});
