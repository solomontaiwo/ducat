import { describe, expect, it } from "vitest";
import { generateExportFileName, getUserName, sanitizeFilename } from "../src/utils/exportFilename.js";
import { APP_SLUG } from "../src/utils/brand.js";

describe("export filenames", () => {
  it("uses profile, period and range", () => {
    expect(getUserName({ displayName: "Nome Profilo", email: "other@example.com" })).toBe("Nome Profilo");
    expect(generateExportFileName(
      "monthly",
      new Date(2026, 7, 1, 12),
      new Date(2026, 7, 31, 12),
      "Nome Profilo",
      "csv"
    )).toMatch(new RegExp(`^report-${APP_SLUG}-nome_profilo-monthly-2026-08-01_2026-08-31-\\d{8}-\\d{6}\\.csv$`));
  });

  it("sanitizes unsafe characters", () => {
    expect(sanitizeFilename("A/B:C?*")).toBe("a_b_c__");
  });
});
