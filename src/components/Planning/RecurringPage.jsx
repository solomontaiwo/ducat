import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiPause, FiPlay, FiSkipForward, FiTrash2, FiZap } from "react-icons/fi";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { useAddTransaction } from "../../context/AddTransactionContext.jsx";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import formatCurrency, { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { minorToMajor } from "../../utils/money.js";
import { todayDateKey } from "../../utils/dateUtils.js";
import { firstIndexFrom, monthlyEquivalentMinor, nextOccurrence, upcomingOccurrences } from "../../utils/recurrence.js";
import { cn } from "../../lib/utils";
import UpcomingList from "./UpcomingList.jsx";
import BackButton from "./BackButton.jsx";
import { shortDate } from "./planningFormat.js";

const RecurringPage = () => {
  const { t, i18n } = useTranslation();
  const { recurring, ready, updateRecurring, deleteRecurring, skipOccurrence } = usePlanning();
  const { openAddTransaction, canAdd } = useAddTransaction();
  const [selected, setSelected] = useState(null);

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
    const ok = await action();
    if (ok) setSelected(null);
  };

  return (
    <div className="page-shell">
      <header className="mobile-glass-header flex items-center gap-2">
        <BackButton />
        <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("recurring.title")}</h1>
      </header>

      {recurring.length > 0 && (
        <section className="surface grid grid-cols-2 divide-x divide-border py-4 text-center" aria-label={t("recurring.title")}>
          <div className="px-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("recurring.fixedExpenses")}</p>
            <p className="amount text-lg sm:text-xl">{formatSignedAmount(minorToMajor(totals.expense), "expense")}</p>
          </div>
          <div className="px-3">
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

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">{selected?.description}</DialogTitle>
            <DialogDescription>
              {selected && `${formatCurrency(minorToMajor(selected.amountMinor))} · ${t(`recurring.every.${selected.frequency}`)}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="grid gap-2 pt-2">
              {!selected.paused && (
                <Button variant="outline" className="h-12 justify-start" onClick={() => run(() => skipOccurrence(selected))}>
                  <FiSkipForward aria-hidden="true" />
                  {t("recurring.skip")} ({shortDate(nextOccurrence(selected).dateKey, i18n.language)})
                </Button>
              )}
              <Button
                variant="outline"
                className="h-12 justify-start"
                onClick={() => run(() => updateRecurring(selected.id, { mode: selected.mode === "auto" ? "confirm" : "auto" }))}
              >
                <FiZap aria-hidden="true" />
                {selected.mode === "auto" ? t("recurring.switchToConfirm") : t("recurring.switchToAuto")}
              </Button>
              <Button variant="outline" className="h-12 justify-start" onClick={() => run(() => updateRecurring(selected.id, selected.paused
                ? { paused: false, nextIndex: firstIndexFrom(selected, todayDateKey()) }
                : { paused: true }))}>
                {selected.paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
                {selected.paused ? t("recurring.resume") : t("recurring.pause")}
              </Button>
              <Button variant="outline" className="h-12 justify-start text-destructive hover:text-destructive" onClick={() => run(() => deleteRecurring(selected.id))}>
                <FiTrash2 aria-hidden="true" />
                {t("recurring.delete")}
              </Button>
              <p className="px-1 text-xs text-muted-foreground">{t("recurring.deleteHint")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringPage;
