import { describe, expect, it } from "vitest";
import { groupTransactionsByMonth, matchesSearch, mergeTransactions } from "../src/utils/transactionSearch.js";

const tx = (id, description, amount, date, category = "abbonamenti") => ({ id, description, amount, date: new Date(date), category, type: "expense" });
const label = (value) => ({ abbonamenti: "Abbonamenti", alimentazione: "Ristoranti e bar" }[value] || value);

describe("transaction search", () => {
  it("matches description without case or accents", () => {
    expect(matchesSearch(tx("1", "Caffè Centrale", 3, "2026-10-01"), "caffe")).toBe(true);
    expect(matchesSearch(tx("1", "Apple iCloud", 3, "2026-10-01"), "APPLE")).toBe(true);
    expect(matchesSearch(tx("1", "Apple iCloud", 3, "2026-10-01"), "netflix")).toBe(false);
  });

  it("matches the translated category label", () => {
    expect(matchesSearch(tx("1", "Pranzo", 12, "2026-10-01", "alimentazione"), "ristoranti", label)).toBe(true);
  });

  it("matches amounts typed with comma or dot", () => {
    const item = tx("1", "Spotify", 21.5, "2026-10-01");
    expect(matchesSearch(item, "21")).toBe(true);
    expect(matchesSearch(item, "21,5")).toBe(true);
    expect(matchesSearch(item, "21.50")).toBe(true);
    expect(matchesSearch(item, "22")).toBe(false);
  });

  it("merges history with fresh copies and drops removed ids", () => {
    const merged = mergeTransactions(
      [tx("a", "Old", 1, "2026-01-01"), tx("b", "Gone", 1, "2026-01-02")],
      [tx("a", "New", 1, "2026-01-01"), tx("c", "Added", 1, "2026-10-01")],
      new Set(["b"])
    );
    expect(merged.map((item) => `${item.id}:${item.description}`).sort()).toEqual(["a:New", "c:Added"]);
  });

  it("groups results by month, newest first", () => {
    const groups = groupTransactionsByMonth([
      tx("1", "A", 1, "2026-03-21T10:00:00"),
      tx("2", "B", 1, "2026-10-02T10:00:00"),
      tx("3", "C", 1, "2026-10-01T10:00:00"),
    ], "it");
    expect(groups.map((group) => group.displayDate)).toEqual(["Ottobre 2026", "Marzo 2026"]);
    expect(groups[0].transactions).toHaveLength(2);
  });
});
