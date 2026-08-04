import { describe, expect, it } from "vitest";
import { buildAccountExport } from "../src/utils/accountExport.js";

describe("buildAccountExport", () => {
  it("produces a stable, portable representation without Firebase internals", () => {
    const exported = buildAccountExport({
      user: {
        uid: "user-1",
        email: "test@example.com",
        emailVerified: true,
        metadata: { creationTime: "2026-01-01T00:00:00Z" },
      },
      profileName: "Test",
      exportedAt: new Date("2026-08-04T12:00:00Z"),
      transactions: [{
        id: "tx-1",
        amountMinor: 1234,
        currency: "EUR",
        description: "Pranzo",
        dateKey: "2026-08-04",
        category: "food",
        type: "expense",
        schemaVersion: 2,
      }],
    });

    expect(exported.exportedAt).toBe("2026-08-04T12:00:00.000Z");
    expect(exported.transactions[0]).toEqual(expect.objectContaining({ amountMinor: 1234, amount: 12.34 }));
    expect(exported.transactions[0]).not.toHaveProperty("date");
  });
});
