import { useMemo, useState } from "react";
import { FiPlus, FiTarget, FiTrendingUp, FiTrash2, FiZap } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { useGoal } from "../../hooks/useGoals.jsx";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const GoalList = () => {
  const { t } = useTranslation();
  const {
    goals,
    loading,
    addGoal,
    deleteGoal,
    addContribution,
    applyAutoContributions,
  } = useGoal();

  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "0",
    dueDate: dayjs().add(3, "month").format("YYYY-MM-DD"),
    autoContribute: false,
    autoContributeAmount: "0",
  });

  const orderedGoals = useMemo(
    () => [...goals].sort((a, b) => a.dueDate - b.dueDate),
    [goals]
  );

  const handleAddGoal = async (e) => {
    e.preventDefault();
    const success = await addGoal({
      ...formData,
      targetAmount: Number(formData.targetAmount),
      currentAmount: Number(formData.currentAmount || 0),
      autoContributeAmount: Number(formData.autoContributeAmount || 0),
      dueDate: new Date(formData.dueDate),
    });

    if (success) {
      setShowAdd(false);
      setFormData({
        name: "",
        targetAmount: "",
        currentAmount: "0",
        dueDate: dayjs().add(3, "month").format("YYYY-MM-DD"),
        autoContribute: false,
        autoContributeAmount: "0",
      });
    }
  };

  return (
    <div className="page-shell space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{t("goals.title")}</CardTitle>
            <CardDescription>{t("goals.subtitle")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={applyAutoContributions}>
              <FiZap /> {t("goals.applyAuto")}
            </Button>
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <FiPlus /> {t("goals.add")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {orderedGoals.map((goal) => {
          const percentage =
            goal.targetAmount > 0
              ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
              : 0;
          return (
            <Card key={goal.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FiTarget /> {goal.name}
                    </CardTitle>
                    <CardDescription>
                      {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteGoal(goal.id)}>
                    <FiTrash2 className="text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{percentage}%</span>
                  <span>
                    {t("goals.due")} {dayjs(goal.dueDate).format("DD MMM YYYY")}
                  </span>
                </div>

                <div className="flex gap-2">
                  {[10, 25, 50].map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => addContribution(goal.id, amount)}
                    >
                      <FiTrendingUp className="h-3 w-3" /> +{amount}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && !orderedGoals.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("goals.empty")}
          </CardContent>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("goals.add")}</DialogTitle>
            <DialogDescription>{t("goals.addSubtitle")}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleAddGoal}>
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("goals.targetAmount")}</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.targetAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, targetAmount: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("goals.startAmount")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.currentAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, currentAmount: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("goals.dueDate")}</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.autoContribute}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, autoContribute: e.target.checked }))
                }
              />
              {t("goals.autoContribute")}
            </label>

            {formData.autoContribute && (
              <div className="space-y-2">
                <Label>{t("goals.autoContributeAmount")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.autoContributeAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, autoContributeAmount: e.target.value }))
                  }
                />
              </div>
            )}

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

export default GoalList;
