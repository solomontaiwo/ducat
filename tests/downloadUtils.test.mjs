import assert from "node:assert/strict";
import test from "node:test";
import { generateExportFileName, getUserName, sanitizeFilename } from "../src/utils/exportFilename.js";

test("uses the profile display name for export filenames", () => {
  assert.equal(getUserName({ displayName: "Nome Profilo", email: "other@example.com" }), "Nome Profilo");
  assert.match(
    generateExportFileName("monthly", new Date(), new Date(), "Nome Profilo", "csv"),
    /^report-soldisotto-nome_profilo-\d{8}-\d{4}\.csv$/
  );
});

test("sanitizes unsafe filename characters", () => {
  assert.equal(sanitizeFilename("A/B:C?*"), "a_b_c__");
});
