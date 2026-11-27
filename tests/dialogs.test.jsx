import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import PropTypes from "prop-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../src/components/ui/dialog.jsx";
import { trackOpenDialog, useAnyDialogOpen } from "../src/components/ui/dialogStack.js";
import TransactionActionsDialog from "../src/components/Transaction/TransactionActionsDialog.jsx";
import DeleteTransactionDialog from "../src/components/Transaction/DeleteTransactionDialog.jsx";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }) }));

afterEach(() => cleanup());

const Simple = ({ open, className }) => (
  <Dialog open={open}>
    <DialogContent className={className}>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Body</DialogDescription>
    </DialogContent>
  </Dialog>
);
Simple.propTypes = { open: PropTypes.bool.isRequired, className: PropTypes.string };

describe("open dialog tracking", () => {
  it("counts the dialogs on screen, also overlapping ones", () => {
    const { result } = renderHook(() => useAnyDialogOpen());
    expect(result.current).toBe(false);
    let releaseA;
    let releaseB;
    act(() => { releaseA = trackOpenDialog(); releaseB = trackOpenDialog(); });
    expect(result.current).toBe(true);
    act(() => { releaseA(); releaseA(); });
    // Releasing twice does not close the other dialog.
    expect(result.current).toBe(true);
    act(() => releaseB());
    expect(result.current).toBe(false);
  });

  it("reports a dialog only while its content is on screen", () => {
    const { result } = renderHook(() => useAnyDialogOpen());
    const view = render(<Simple open={false} />);
    expect(result.current).toBe(false);
    view.rerender(<Simple open />);
    expect(result.current).toBe(true);
    view.rerender(<Simple open={false} />);
    expect(result.current).toBe(false);
    view.rerender(<Simple open />);
    view.unmount();
    expect(result.current).toBe(false);
  });
});

describe("dialog placement", () => {
  it("centres default dialogs in the safe area and keeps the caller's width", () => {
    render(<Simple open className="max-w-sm" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("dialog-place-center", "max-w-sm", "overflow-y-auto");
    // `cn` does not merge classes: the default cap must not override max-w-sm.
    expect(dialog).not.toHaveClass("max-w-2xl");
  });

  it("caps default dialogs when the caller sets no width", () => {
    render(<Simple open />);
    expect(screen.getByRole("dialog")).toHaveClass("max-w-2xl");
  });
});

describe("transaction dialogs", () => {
  it("shows the actions as a bottom sheet and keeps the title while closing", () => {
    const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
    const transaction = { id: "t1", description: "Lunch" };
    const view = render(<TransactionActionsDialog transaction={transaction} {...handlers} />);
    const sheet = screen.getByRole("dialog", { name: "Lunch" });
    expect(sheet).toHaveClass("dialog-place-bottom", "sm:max-w-sm");
    expect(sheet).not.toHaveClass("sm:max-w-md");
    fireEvent.click(screen.getByRole("button", { name: "transactions.actions.edit" }));
    fireEvent.click(screen.getByRole("button", { name: "transactions.actions.delete" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(transaction);
    expect(handlers.onDelete).toHaveBeenCalledWith("t1");
    view.rerender(<TransactionActionsDialog transaction={null} {...handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks a short question and keeps both buttons on one row", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteTransactionDialog
        open
        transaction={{ description: "Lunch", date: new Date(2026, 0, 2), category: "food", type: "expense", amount: 12 }}
        formatDate={() => "2 Jan"}
        getCategoryLabel={() => "Food"}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "transactions.deleteTitle" });
    expect(dialog).toHaveAccessibleDescription("transactions.deleteDescription");
    const confirm = screen.getByRole("button", { name: "transactions.deleteConfirm" });
    const cancel = screen.getByRole("button", { name: "cancel" });
    expect(confirm.parentElement).toBe(cancel.parentElement);
    expect(confirm.parentElement).toHaveClass("flex");
    expect(confirm.parentElement).not.toHaveClass("flex-col-reverse");
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
  });
});
