import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFile } from "../src/utils/saveFile.js";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
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


describe("desktop file saving", () => {
  it("writes bytes only after the user selects a destination", async () => {
    vi.stubEnv("MODE", "desktop");
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    save.mockResolvedValueOnce(null).mockResolvedValueOnce("/tmp/report.pdf");
    expect(await saveFile(blob, "report.pdf")).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
    expect(await saveFile(blob, "report.pdf")).toBe(true);
    expect(writeFile).toHaveBeenCalledWith("/tmp/report.pdf", new Uint8Array([1, 2, 3]));
  });
  it("propagates a file write failure", async () => {
    vi.stubEnv("MODE", "desktop");
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    save.mockResolvedValue("/tmp/report.csv");
    writeFile.mockRejectedValueOnce(new Error("write failed"));
    await expect(saveFile({ arrayBuffer: async () => new ArrayBuffer(0) }, "report.csv"))
      .rejects.toThrow("write failed");
  });
});
