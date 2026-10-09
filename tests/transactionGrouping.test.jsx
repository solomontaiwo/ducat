import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));

import DeleteTransactionDialog from "../src/components/Transaction/DeleteTransactionDialog.jsx";
import TransactionActionsDialog from "../src/components/Transaction/TransactionActionsDialog.jsx";
import { compareTransactions } from "../src/utils/transactionOrder.js";
import { formatGroupDate, groupTransactionsByDate } from "../src/utils/transactionGrouping.js";

afterEach(cleanup);

const t = (key) => key;

describe("groupTransactionsByDate", () => {
  const day = (d, id) => ({ id, date: new Date(2026, 8, d, 10) });

  it("groups by calendar day, newest first, with a stable order inside a day", () => {
    const groups = groupTransactionsByDate([day(1, "a"), day(2, "b"), day(2, "c"), day(1, "d")], (date) => String(date.getDate()));
    expect(groups.map((group) => group.displayDate)).toEqual(["2", "1"]);
    expect(groups[0].transactions.map((item) => item.id)).toEqual(["c", "b"]);
    expect(groups[1].transactions.map((item) => item.id)).toEqual(["d", "a"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupTransactionsByDate([], () => "")).toEqual([]);
  });
});

describe("formatGroupDate", () => {
  it("uses relative labels for today and yesterday", () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    expect(formatGroupDate(now, "it", t)).toBe("transactions.today");
    expect(formatGroupDate(yesterday, "en", t)).toBe("transactions.yesterday");
  });

  it("formats older dates in the active language", () => {
    expect(formatGroupDate(new Date(2020, 0, 5), "it", t)).toBe("5 gennaio 2020");
    expect(formatGroupDate(new Date(2020, 0, 5), "en", t)).toBe("January 5, 2020");
  });
});

describe("compareTransactions", () => {
  it("orders by date and breaks ties by ID, descending", () => {
    const same = new Date("2026-09-06T00:00:00Z");
    expect([{ id: "a", date: same }, { id: "b", date: same }].sort(compareTransactions).map((item) => item.id)).toEqual(["b", "a"]);
    expect(compareTransactions({ id: "x", date: new Date(2026, 0, 2) }, { id: "y", date: new Date(2026, 0, 1) })).toBeLessThan(0);
  });
});

describe("TransactionActionsDialog", () => {
  const transaction = { id: "t1", description: "Pranzo" };

  it("routes each action with the right transaction", () => {
    const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
    render(<TransactionActionsDialog transaction={transaction} {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "transactions.actions.edit" }));
    fireEvent.click(screen.getByRole("button", { name: "transactions.actions.duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "transactions.actions.delete" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(transaction);
    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).toHaveBeenCalledWith("t1");
  });

  it("renders nothing while no transaction is selected", () => {
    render(<TransactionActionsDialog transaction={null} onClose={() => {}} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DeleteTransactionDialog", () => {
  const transaction = { description: "Affitto", date: new Date(2026, 8, 1), category: "casa", type: "expense", amount: 700 };

  it("shows what will be deleted and asks for confirmation", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteTransactionDialog open transaction={transaction} formatDate={() => "1 settembre 2026"} getCategoryLabel={() => "Casa"} onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByText("Affitto")).toBeInTheDocument();
    expect(screen.getByText(/1 settembre 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "transactions.deleteConfirm" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
