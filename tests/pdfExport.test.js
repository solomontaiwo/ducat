import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveFile: vi.fn() }));
vi.mock("../src/utils/saveFile.js", () => ({ saveFile: (...args) => mocks.saveFile(...args) }));

import { generatePeriodPDFReport } from "../src/utils/pdfUtils.jsx";

const transactions = [
  { id: "a", type: "expense", amount: 12.5, amountMinor: 1250, currency: "EUR", description: "Pizza", category: "ristoranti", dateKey: "2026-11-20", date: new Date(2026, 10, 20) },
  { id: "b", type: "income", amount: 100, amountMinor: 10000, currency: "EUR", description: "Rimborso", category: "rimborsi", dateKey: "2026-11-21", date: new Date(2026, 10, 21) },
];

beforeEach(() => mocks.saveFile.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("PDF report export", () => {
  for (const mode of ["mobile", "desktop", "production"]) {
    it(`hands the PDF to the platform file saver (${mode})`, async () => {
      vi.stubEnv("MODE", mode);
      mocks.saveFile.mockResolvedValue(true);
      const result = await generatePeriodPDFReport(transactions, new Date(2026, 10, 1), new Date(2026, 10, 30), "November", "en", "Ada");
      expect(result.success).toBe(true);
      expect(mocks.saveFile).toHaveBeenCalledTimes(1);
      const [blob, filename] = mocks.saveFile.mock.calls[0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/pdf");
      expect(filename).toMatch(/\.pdf$/);
    });
  }

  it("reports a cancelled save as not successful", async () => {
    vi.stubEnv("MODE", "desktop");
    mocks.saveFile.mockResolvedValue(false);
    const result = await generatePeriodPDFReport(transactions, new Date(2026, 10, 1), new Date(2026, 10, 30), "November", "en", "Ada");
    expect(result.success).toBe(false);
  });
});
