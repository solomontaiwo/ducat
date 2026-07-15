import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCalendar, FiCheck, FiPlus, FiRepeat, FiTrash2 } from "react-icons/fi";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useRecurringRules } from "../../context/RecurringRuleProvider.jsx";
import { RecurringDetectionService } from "../../services/recurringDetectionService.jsx";
import { buildCashflowForecast, getCurrentBalance } from "../../services/cashflowForecastService.js";
import { firestore } from "../../utils/firebase.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";

const toDateInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const isSameDay = (a, b) => toDateInput(a) === toDateInput(b);

const CashflowPlanner = () => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const { transactions, isDemo, addTransaction } = useUnifiedTransactions();
  const { rules, loading, addRule, updateRule, deleteRule } = useRecurringRules();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingBalanceInput, setOpeningBalanceInput] = useState("0");
  const [savingBalance, setSavingBalance] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    type: "expense",
    description: "",
    amount: "",
    category: expenseCategories[0]?.value || "",
    frequency: "monthly",
    nextDueDate: toDateInput(new Date()),
  });

  useEffect(() => {
    const loadOpeningBalance = async () => {
      if (!currentUser || isDemo) {
        setOpeningBalance(0);
        setOpeningBalanceInput("0");
        return;
      }
      try {
        const snapshot = await getDoc(doc(firestore, "users", currentUser.uid));
        const value = Number(snapshot.data()?.cashflowOpeningBalance) || 0;
        setOpeningBalance(value);
        setOpeningBalanceInput(String(value));
      } catch (error) {
        console.error("Unable to load cashflow opening balance", error);
      }
    };
    loadOpeningBalance();
  }, [currentUser, isDemo]);

  const currentBalance = useMemo(
    () => getCurrentBalance(transactions, openingBalance),
    [transactions, openingBalance]
  );
  const forecast = useMemo(
    () => buildCashflowForecast({ rules, currentBalance, days: 60 }),
    [rules, currentBalance]
  );
  const negativeDay = useMemo(
    () => forecast.timeline.find((day) => day.balance < 0),
    [forecast.timeline]
  );
  const detectedRules = useMemo(
    () => RecurringDetectionService.detectRecurring(transactions)
      .filter((rule) => ["weekly", "biweekly", "monthly"].includes(rule.frequency))
      .filter((rule) => !rules.some((saved) => saved.type === "expense" && saved.category === rule.category && saved.description.toLowerCase() === rule.description.toLowerCase())),
    [transactions, rules]
  );

  const categories = formData.type === "income" ? incomeCategories : expenseCategories;

  const resetForm = useCallback(() => {
    setFormData({
      type: "expense",
      description: "",
      amount: "",
      category: expenseCategories[0]?.value || "",
      frequency: "monthly",
      nextDueDate: toDateInput(new Date()),
    });
  }, [expenseCategories]);

  const saveOpeningBalance = async () => {
    const value = Number(openingBalanceInput.replace(",", "."));
    if (!Number.isFinite(value)) {
      notification.error(t("planner.invalidBalance"));
      return;
    }
    if (!currentUser || isDemo) return;
    setSavingBalance(true);
    try {
      await setDoc(doc(firestore, "users", currentUser.uid), { cashflowOpeningBalance: value }, { merge: true });
      setOpeningBalance(value);
      notification.success(t("planner.balanceSaved"));
    } catch (error) {
      console.error("Unable to save cashflow opening balance", error);
      notification.error(t("planner.balanceSaveError"));
    } finally {
      setSavingBalance(false);
    }
  };

  const handleTypeChange = (type) => {
    const nextCategories = type === "income" ? incomeCategories : expenseCategories;
    setFormData((previous) => ({ ...previous, type, category: nextCategories[0]?.value || "" }));
  };

  const handleAddRule = async (event) => {
    event.preventDefault();
    const success = await addRule({ ...formData, amount: Number(formData.amount), nextDueDate: new Date(`${formData.nextDueDate}T12:00:00`) });
    if (success) {
      setShowAdd(false);
      resetForm();
      notification.success(t("planner.ruleAdded"));
    }
  };

  const prefillDetectedRule = (rule) => {
    setFormData({
      type: "expense",
      description: rule.description,
      amount: String(rule.amount),
      category: rule.category,
      frequency: rule.frequency,
      nextDueDate: toDateInput(rule.nextDueDate),
    });
    setShowAdd(true);
  };

  const registerOccurrence = async (event) => {
    const rule = rules.find((item) => item.id === event.ruleId);
    if (!rule || !isSameDay(rule.nextDueDate, event.date)) return;
    const registered = await addTransaction({
      type: rule.type,
      amount: rule.amount,
      description: rule.description,
      category: rule.category,
      date: event.date,
    });
    if (registered) {
      const nextDueDate = rule.frequency === "monthly"
        ? new Date(event.date.getFullYear(), event.date.getMonth() + 1, event.date.getDate())
        : new Date(event.date.getFullYear(), event.date.getMonth(), event.date.getDate() + (rule.frequency === "weekly" ? 7 : 14));
      await updateRule(rule.id, { nextDueDate });
      notification.success(t("planner.occurrenceRegistered"));
    }
  };

  return (
    <div className="page-shell space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FiCalendar /> {t("planner.title")}</CardTitle>
            <CardDescription>{t("planner.subtitle")}</CardDescription>
          </div>
          <Button className="gap-2" onClick={() => setShowAdd(true)} disabled={isDemo}><FiPlus /> {t("planner.addRule")}</Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>{t("planner.currentBalance")}</CardDescription><CardTitle>{formatCurrency(currentBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>{t("planner.endingBalance")}</CardDescription><CardTitle>{formatCurrency(forecast.endingBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>{t("planner.nextEvents")}</CardDescription><CardTitle>{forecast.upcomingEvents.length}</CardTitle></CardHeader></Card>
      </div>

      {negativeDay && <Card className="border-destructive"><CardContent className="flex items-center gap-3 p-4 text-destructive"><FiAlertTriangle /><span>{t("planner.negativeWarning", { date: negativeDay.date.toLocaleDateString(i18n.language === "it" ? "it-IT" : "en-US") })}</span></CardContent></Card>}

      <Card>
        <CardHeader><CardTitle>{t("planner.openingBalance")}</CardTitle><CardDescription>{t("planner.openingBalanceHelp")}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input type="number" step="0.01" value={openingBalanceInput} disabled={isDemo} onChange={(e) => setOpeningBalanceInput(e.target.value)} />
          <Button onClick={saveOpeningBalance} disabled={isDemo || savingBalance}>{t("save")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("planner.forecast")}</CardTitle><CardDescription>{t("planner.forecastHelp")}</CardDescription></CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={forecast.timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString(i18n.language === "it" ? "it-IT" : "en-US", { day: "2-digit", month: "short" })} minTickGap={40} /><YAxis tickFormatter={(value) => formatCurrency(value)} width={90} /><Tooltip labelFormatter={(value) => new Date(value).toLocaleDateString(i18n.language === "it" ? "it-IT" : "en-US")} formatter={(value) => formatCurrency(value)} /><ReferenceLine y={0} stroke="hsl(var(--destructive))" /><Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
        </CardContent>
      </Card>

      {detectedRules.length > 0 && <Card><CardHeader><CardTitle>{t("planner.detectedTitle")}</CardTitle><CardDescription>{t("planner.detectedHelp")}</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{detectedRules.map((rule) => <button key={rule.id} onClick={() => prefillDetectedRule(rule)} disabled={isDemo} className="rounded-xl border border-border p-3 text-left hover:bg-muted disabled:opacity-60"><div className="flex items-center gap-2 font-semibold"><FiRepeat /> {rule.description}</div><div className="mt-1 text-sm text-muted-foreground">{formatCurrency(rule.amount)} · {t(`planner.frequencies.${rule.frequency}`)}</div></button>)}</CardContent></Card>}

      <Card><CardHeader><CardTitle>{t("planner.rules")}</CardTitle><CardDescription>{t("planner.rulesHelp")}</CardDescription></CardHeader><CardContent className="space-y-3">{rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{rule.description}</p><p className="text-sm text-muted-foreground">{rule.type === "income" ? t("income") : t("expense")} · {formatCurrency(rule.amount)} · {t(`planner.frequencies.${rule.frequency}`)} · {t("planner.dueOn", { date: rule.nextDueDate.toLocaleDateString(i18n.language === "it" ? "it-IT" : "en-US") })}</p></div><Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}><FiTrash2 className="text-destructive" /></Button></div>)}{!loading && !rules.length && <p className="py-4 text-center text-sm text-muted-foreground">{t("planner.noRules")}</p>}</CardContent></Card>

      <Card><CardHeader><CardTitle>{t("planner.upcoming")}</CardTitle><CardDescription>{t("planner.upcomingHelp")}</CardDescription></CardHeader><CardContent className="space-y-3">{forecast.upcomingEvents.slice(0, 12).map((event, index) => { const isDue = isSameDay(rules.find((rule) => rule.id === event.ruleId)?.nextDueDate, event.date); return <div key={`${event.ruleId}-${event.date.toISOString()}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{event.description}</p><p className="text-sm text-muted-foreground">{event.date.toLocaleDateString(i18n.language === "it" ? "it-IT" : "en-US")} · {event.type === "income" ? "+" : "-"}{formatCurrency(event.amount)}</p></div>{isDue && <Button variant="outline" size="sm" className="gap-2" onClick={() => registerOccurrence(event)} disabled={isDemo}><FiCheck /> {t("planner.register")}</Button>}</div>; })}{!forecast.upcomingEvents.length && <p className="py-4 text-center text-sm text-muted-foreground">{t("planner.noUpcoming")}</p>}</CardContent></Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent><DialogHeader><DialogTitle>{t("planner.addRule")}</DialogTitle><DialogDescription>{t("planner.addRuleHelp")}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={handleAddRule}><div className="grid grid-cols-2 gap-2"><Button type="button" variant={formData.type === "expense" ? "destructive" : "outline"} onClick={() => handleTypeChange("expense")}>{t("expense")}</Button><Button type="button" variant={formData.type === "income" ? "default" : "outline"} onClick={() => handleTypeChange("income")}>{t("income")}</Button></div><div className="space-y-2"><Label>{t("description")}</Label><Input required value={formData.description} onChange={(e) => setFormData((previous) => ({ ...previous, description: e.target.value }))} /></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>{t("amount")}</Label><Input required min="0.01" step="0.01" type="number" value={formData.amount} onChange={(e) => setFormData((previous) => ({ ...previous, amount: e.target.value }))} /></div><div className="space-y-2"><Label>{t("transactionModal.category")}</Label><Select value={formData.category} onChange={(e) => setFormData((previous) => ({ ...previous, category: e.target.value }))}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select></div></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>{t("planner.frequency")}</Label><Select value={formData.frequency} onChange={(e) => setFormData((previous) => ({ ...previous, frequency: e.target.value }))}><option value="weekly">{t("planner.frequencies.weekly")}</option><option value="biweekly">{t("planner.frequencies.biweekly")}</option><option value="monthly">{t("planner.frequencies.monthly")}</option></Select></div><div className="space-y-2"><Label>{t("planner.nextDue")}</Label><Input required type="date" value={formData.nextDueDate} onChange={(e) => setFormData((previous) => ({ ...previous, nextDueDate: e.target.value }))} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>{t("cancel")}</Button><Button type="submit">{t("add")}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
};

export default CashflowPlanner;
