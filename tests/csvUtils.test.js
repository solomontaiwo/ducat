import { describe, expect, it } from "vitest";
import { escapeCsvCell, neutralizeSpreadsheetFormula, serializeCsv } from "../src/utils/csvUtils.js";

describe("CSV serialization", () => {
  it.each(["=HYPERLINK(\"https://example.com\")", "+cmd", "-1+2", "@SUM(A1:A2)", "\tformula"])(
    "neutralizes spreadsheet formula %s",
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`)
  );

  it("escapes quotes, commas and newlines", () => {
    expect(escapeCsvCell('a,"b"\nç')).toBe('"a,""b""\nç"');
  });

  it("uses BOM and CRLF", () => {
    expect(serializeCsv(["A"], [["è"]])).toBe('\uFEFF"A"\r\n"è"');
  });
});
