import { useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useBudget } from "../../hooks/useBudgets.jsx";
import { useCategories } from "../../utils/categories.jsx";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const BudgetList = () => {
  const { t } = useTranslation();
  const { expenseCategories } = useCategories();
  const { loading, addBudget, deleteBudget, getBudgetStatus, smartSuggestions } = useBudget();

  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    category: expenseCategories[0]?.value || "",
    limit: "",
    period: "monthly",
    alertThreshold: "80",
  });

  const statusRows = useMemo(() => getBudgetStatus(), [getBudgetStatus]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const success = await addBudget({
      ...formData,
      limit: Number(formData.limit),
      alertThreshold: Number(formData.alertThreshold),
    });
    if (success) {
      setShowAdd(false);
      setFormData({
        category: expenseCategories[0]?.value || "",
        limit: "",
        period: "monthly",
        alertThreshold: "80",
      });
    }
  };

  return (
    <div className="page-shell space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{t("budgets.title")}</CardTitle>
            <CardDescription>{t("budgets.subtitle")}</CardDescription>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <FiPlus /> {t("budgets.add")}
          </Button>
        </CardHeader>
      </Card>

      {smartSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("budgets.suggestions")}</CardTitle>
            <CardDescription>{t("budgets.suggestionsSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {smartSuggestions.map((item) => (
              <button
                key={item.category}
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    category: item.category,
                    limit: String(item.suggestedLimit),
                  }));
                  setShowAdd(true);
                }}
                className="rounded-xl border border-border p-3 text-left hover:bg-muted"
              >
                <div className="font-semibold">{item.label}</div>
                <div className="text-sm text-muted-foreground">
                  {t("budgets.suggestedLimit")}: {formatCurrency(item.suggestedLimit)}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {statusRows.map((budget) => {
          const percentage = Math.min(100, Math.round(budget.percentage));
          const isAlert = percentage >= budget.alertThreshold;
          return (
            <Card key={budget.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="capitalize">{t(`categories.${budget.category}`, { defaultValue: budget.category })}</CardTitle>
                  <CardDescription>
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteBudget(budget.id)}>
                  <FiTrash2 className="text-destructive" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${isAlert ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{percentage}%</span>
                  <span>{t("budgets.remaining")}: {formatCurrency(budget.remaining)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && !statusRows.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("budgets.empty")}
          </CardContent>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("budgets.add")}</DialogTitle>
            <DialogDescription>{t("budgets.addSubtitle")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("transactionModal.category")}</Label>
              <Select
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                required
              >
                {expenseCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("budgets.limit")}</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={formData.limit}
                onChange={(e) => setFormData((prev) => ({ ...prev, limit: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t("budgets.alertThreshold")}</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={formData.alertThreshold}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, alertThreshold: e.target.value }))
                }
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("add")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetList;
