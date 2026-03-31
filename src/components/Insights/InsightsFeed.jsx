import { useMemo } from "react";
import { FiCheckCircle, FiRepeat, FiTarget } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useGoal } from "../../hooks/useGoals.jsx";
import { InsightsService } from "../../services/insightsService.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const iconByType = {
  recurring_detected: FiRepeat,
  goal_completed: FiCheckCircle,
  goal_progress: FiTarget,
  healthy: FiCheckCircle,
};

const InsightsFeed = () => {
  const { t } = useTranslation();
  const { transactions } = useUnifiedTransactions();
  const { goals } = useGoal();

  const insights = useMemo(
    () => InsightsService.generate({ transactions, goals }),
    [transactions, goals]
  );

  return (
    <div className="page-shell space-y-4">
      <Card className="glass">
        <CardHeader>
          <CardTitle>{t("insights.title")}</CardTitle>
          <CardDescription>{t("insights.subtitle")}</CardDescription>
        </CardHeader>
      </Card>

      {insights.length ? (
        <div className="grid gap-3">
          {insights.map((insight, idx) => {
            const Icon = iconByType[insight.type] || FiCheckCircle;
            return (
              <Card key={`${insight.type}-${idx}`}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{insight.title}</h3>
                    <p className="text-sm text-muted-foreground">{insight.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("insights.empty")}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InsightsFeed;
