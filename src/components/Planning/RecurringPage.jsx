import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPause, FiPlay, FiSkipForward, FiTrash2, FiZap } from "react-icons/fi";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { useAddTransaction } from "../../context/AddTransactionContext.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Sheet from "../ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import formatCurrency, { formatSignedAmount, moneyLocale } from "../../utils/formatCurrency.jsx";
import { currencySymbol } from "../../utils/currency.js";
import { useAccountCurrency } from "../../hooks/useAccountCurrency.js";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money.js";
import { todayDateKey } from "../../utils/dateUtils.js";
import { FREQUENCIES, firstIndexFrom, monthlyEquivalentMinor, nextOccurrence, reanchorForFrequency, upcomingOccurrences } from "../../utils/recurrence.js";
import { handleRadioKeyDown } from "../../utils/radioGroup.js";
import { hapticSuccess } from "../../platform/haptics.js";
import { cn } from "../../lib/utils.js";
import UpcomingList from "./UpcomingList.jsx";
import BackButton from "./BackButton.jsx";
import { shortDate } from "./planningFormat.js";

const toAmountInput = (minor, language) => {
  const raw = String(minorToMajor(minor));
  return String(language || "").toLowerCase().startsWith("en") ? raw : raw.replace(".", ",");
};

const RecurringPage = () => {
  const { t, i18n } = useTranslation();
  const currency = useAccountCurrency();
  const { recurring, ready, updateRecurring, deleteRecurring, skipOccurrence } = usePlanning();
  const { openAddTransaction, canAdd } = useAddTransaction();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ description: "", amount: "", category: "", frequency: "monthly", mode: "auto" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const editCategories = useMemo(() => {
    if (!editing) return [];
    const list = editing.type === "income" ? incomeCategories : expenseCategories;
    if (list.some((item) => item.value === editing.category)) return list;
    return [{ value: editing.category, label: t(`categories.${editing.category}`, { defaultValue: editing.category }) }, ...list];
  }, [editing, expenseCategories, incomeCategories, t]);

  const startEdit = (rule) => {
    setSelected(null);
    setEditing(rule);
    setEditForm({
      description: rule.description,
      amount: toAmountInput(rule.amountMinor, i18n.language),
      category: rule.category,
      frequency: rule.frequency,
      mode: rule.mode,
    });
  };

  const handleSaveEdit = async (event) => {
    event?.preventDefault();
    if (!editing || busy) return;
    const description = editForm.description.trim();
    if (!description) {
      notification.error(t("recurring.editDescriptionRequired"));
      return;
    }
    let amountMinor;
    try {
      amountMinor = parseMoneyToMinor(editForm.amount.replace(",", "."));
    } catch (error) {
      notification.error(error.i18nKey ? t(error.i18nKey) : t("transaction.invalidAmount"));
      return;
    }
    const patch = {
      description,
      amountMinor,
      category: editForm.category,
      mode: editForm.mode,
    };
    if (editForm.frequency !== editing.frequency) {
      const anchorDateKey = reanchorForFrequency(editing, editForm.frequency);
      if (!anchorDateKey) {
        notification.error(t("recurring.frequencyChangeUnavailable"));
        return;
      }
      patch.frequency = editForm.frequency;
      patch.anchorDateKey = anchorDateKey;
    }
    setBusy(true);
    try {
      if (await updateRecurring(editing.id, patch)) {
        hapticSuccess();
        setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const today = todayDateKey();
  const upcoming = useMemo(() => upcomingOccurrences(recurring, today), [recurring, today]);
  const sorted = useMemo(() => [...recurring].sort((first, second) => (
    Number(first.paused) - Number(second.paused)
    || nextOccurrence(first).dateKey.localeCompare(nextOccurrence(second).dateKey)
  )), [recurring]);
  const totals = useMemo(() => recurring.filter((rule) => !rule.paused).reduce((sum, rule) => {
    sum[rule.type] += monthlyEquivalentMinor(rule);
    return sum;
  }, { income: 0, expense: 0 }), [recurring]);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await action();
      if (ok) setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmRuleDelete = async () => {
    if (!confirmDelete || busy) return;
    setBusy(true);
    try {
      if (await deleteRecurring(confirmDelete.id)) {
        setConfirmDelete(null);
        setSelected(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="mobile-glass-header flex items-center gap-2">
        <div className="md:hidden"><BackButton /></div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("recurring.title")}</h1>
      </header>

      {recurring.length > 0 && (
        <section className="surface grid grid-cols-2 divide-x divide-border py-4 text-center" aria-label={t("recurring.title")}>
          <div className="flex flex-col justify-between gap-0.5 px-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("recurring.fixedExpenses")}</p>
            <p className="amount text-lg sm:text-xl">{formatSignedAmount(minorToMajor(totals.expense), "expense")}</p>
          </div>
          <div className="flex flex-col justify-between gap-0.5 px-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("recurring.fixedIncome")}</p>
            <p className="amount text-lg text-income sm:text-xl">{formatSignedAmount(minorToMajor(totals.income), "income")}</p>
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2" aria-labelledby="recurring-upcoming">
          <h2 id="recurring-upcoming" className="px-1 font-sans text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("recurring.upcoming")} · {t("recurring.upcomingHint")}
          </h2>
          <div className="surface px-4">
            <UpcomingList items={upcoming} />
          </div>
        </section>
      )}

      {ready && recurring.length === 0 ? (
        <section className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h2 className="text-lg font-bold">{t("recurring.empty")}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t("recurring.emptyHint")}</p>
          {canAdd && <Button onClick={openAddTransaction}>{t("recurring.addFirst")}</Button>}
        </section>
      ) : (
        <section className="space-y-2" aria-labelledby="recurring-all">
          <h2 id="recurring-all" className="px-1 font-sans text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{t("recurring.all")}</h2>
          <ul className="surface divide-y divide-border px-2">
            {sorted.map((rule) => {
              const next = nextOccurrence(rule);
              const meta = rule.paused
                ? `${t(`recurring.every.${rule.frequency}`)} · ${t("recurring.paused")}`
                : `${t(`recurring.every.${rule.frequency}`)} · ${t("recurring.next", { date: shortDate(next.dateKey, i18n.language) })}`;
              return (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(rule)}
                    disabled={!ready}
                    className={cn("flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-muted/60", rule.paused && "opacity-60")}
                  >
                    <CategoryBadge category={rule.category} type={rule.type} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold leading-snug">{rule.description}</span>
                      <span className="truncate text-[13px] font-medium text-muted-foreground">{meta}</span>
                    </span>
                    <span className={cn("amount shrink-0 text-base", rule.type === "income" && "text-income")}>
                      {formatSignedAmount(minorToMajor(rule.amountMinor), rule.type)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Sheet
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.description ?? ""}
        description={selected ? `${formatCurrency(minorToMajor(selected.amountMinor))} · ${t(`recurring.every.${selected.frequency}`)}` : undefined}
        className="sm:max-w-sm"
      >
        {selected && (
          <div className="grid gap-2">
            <Button variant="outline" className="h-12 justify-start" disabled={!ready || busy} onClick={() => startEdit(selected)}>
              <FiEdit2 aria-hidden="true" />
              {t("recurring.edit")}
            </Button>
            {!selected.paused && (
              <Button variant="outline" className="h-12 justify-start" disabled={!ready || busy} onClick={() => run(() => skipOccurrence(selected))}>
                <FiSkipForward aria-hidden="true" />
                {t("recurring.skip")} ({shortDate(nextOccurrence(selected).dateKey, i18n.language)})
              </Button>
            )}
            <Button
              variant="outline"
              className="h-12 justify-start" disabled={!ready || busy}
              onClick={() => run(() => updateRecurring(selected.id, { mode: selected.mode === "auto" ? "confirm" : "auto" }))}
            >
              <FiZap aria-hidden="true" />
              {selected.mode === "auto" ? t("recurring.switchToConfirm") : t("recurring.switchToAuto")}
            </Button>
            <Button variant="outline" className="h-12 justify-start" disabled={!ready || busy} onClick={() => run(() => updateRecurring(selected.id, selected.paused
              ? { paused: false, nextIndex: firstIndexFrom(selected, todayDateKey()) }
              : { paused: true }))}>
              {selected.paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
              {selected.paused ? t("recurring.resume") : t("recurring.pause")}
            </Button>
            <Button
              variant="outline"
              className="h-12 justify-start text-destructive hover:text-destructive"
              disabled={!ready || busy}
              onClick={() => {
                const target = selected;
                setSelected(null);
                setConfirmDelete(target);
              }}
            >
              <FiTrash2 aria-hidden="true" />
              {t("recurring.delete")}
            </Button>
            <p className="px-1 text-xs text-muted-foreground">{t("recurring.deleteHint")}</p>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => !open && !busy && setEditing(null)}
        title={t("recurring.editTitle")}
        description={t("recurring.editHint")}
        footer={(
          <Button size="lg" className="w-full" onClick={handleSaveEdit} disabled={busy || !editForm.amount || !editForm.description.trim()}>
            {busy ? t("transactionModal.saving") : t("save")}
          </Button>
        )}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-recurring-description">{t("transactionModal.description")}</Label>
            <Input
              id="edit-recurring-description"
              value={editForm.description}
              onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
              maxLength={200}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-recurring-amount">{t("transaction.amount", { symbol: currencySymbol(currency, moneyLocale(i18n.language)) })}</Label>
            <Input
              id="edit-recurring-amount"
              inputMode="decimal"
              autoComplete="off"
              value={editForm.amount}
              onChange={(event) => setEditForm((current) => ({ ...current, amount: event.target.value.replace(/[^0-9.,]/g, "") }))}
              disabled={busy}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">{t("transactionModal.category")}</legend>
            <div
              role="radiogroup"
              aria-label={t("transactionModal.category")}
              className="flex flex-wrap gap-2"
              onKeyDown={(event) => handleRadioKeyDown(
                event,
                editCategories.map((item) => item.value),
                editForm.category,
                (category) => setEditForm((current) => ({ ...current, category }))
              )}
            >
              {editCategories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={editForm.category === item.value}
                  className="chip"
                  disabled={busy}
                  onClick={() => setEditForm((current) => ({ ...current, category: item.value }))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">{t("recurring.frequencyLabel")}</legend>
            <div
              role="radiogroup"
              aria-label={t("recurring.frequencyLabel")}
              className="segmented grid-cols-3"
              onKeyDown={(event) => handleRadioKeyDown(
                event,
                FREQUENCIES,
                editForm.frequency,
                (frequency) => setEditForm((current) => ({ ...current, frequency }))
              )}
            >
              {FREQUENCIES.map((frequency) => (
                <button
                  key={frequency}
                  type="button"
                  role="radio"
                  aria-checked={editForm.frequency === frequency}
                  disabled={busy}
                  onClick={() => setEditForm((current) => ({ ...current, frequency }))}
                >
                  {t(`recurring.frequency.${frequency}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">{t("recurring.modeLabel")}</legend>
            <div
              role="radiogroup"
              aria-label={t("recurring.modeLabel")}
              className="segmented grid-cols-2"
              onKeyDown={(event) => handleRadioKeyDown(
                event,
                ["auto", "confirm"],
                editForm.mode,
                (mode) => setEditForm((current) => ({ ...current, mode }))
              )}
            >
              {["auto", "confirm"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={editForm.mode === mode}
                  disabled={busy}
                  onClick={() => setEditForm((current) => ({ ...current, mode }))}
                >
                  {t(`recurring.mode.${mode}`)}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      </Sheet>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && !busy && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("recurring.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("recurring.deleteConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2 sm:justify-end">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setConfirmDelete(null)} disabled={busy}>{t("cancel")}</Button>
            <Button variant="destructive" className="flex-1 sm:flex-none" onClick={confirmRuleDelete} disabled={busy}>{t("recurring.delete")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringPage;
