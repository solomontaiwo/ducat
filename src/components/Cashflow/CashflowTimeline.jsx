import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const CashflowTimeline = () => {
  const { t } = useTranslation();
  const { transactions } = useUnifiedTransactions();

  const series = useMemo(() => {
    const sorted = [...transactions]
      .map((transaction) => ({
        ...transaction,
        date: transaction.date instanceof Date ? transaction.date : new Date(transaction.date),
      }))
      .sort((a, b) => a.date - b.date);

    let runningBalance = 0;

    return sorted.map((transaction) => {
      runningBalance += transaction.type === "income" ? transaction.amount : -transaction.amount;
      return {
        dateLabel: transaction.date.toLocaleDateString(),
        balance: Number(runningBalance.toFixed(2)),
      };
    });
  }, [transactions]);

  return (
    <div className="page-shell space-y-4">
      <Card className="glass">
        <CardHeader>
          <CardTitle>{t("cashflow.title")}</CardTitle>
          <CardDescription>{t("cashflow.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 10, right: 10, top: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" hide />
                <YAxis tickFormatter={(value) => formatCurrency(value)} width={90} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {t("cashflow.empty")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashflowTimeline;
