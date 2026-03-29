import { RecurringDetectionService } from "./recurringDetectionService.jsx";

const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);

export const InsightsService = {
  generate({ transactions, budgets = [], goals = [] }) {
    const insights = [];

    const monthStart = startOfMonth();
    const monthExpenses = transactions.filter(
      (t) => t.type === "expense" && (t.date instanceof Date ? t.date : new Date(t.date)) >= monthStart
    );

    budgets.forEach((budget) => {
      const spent = monthExpenses
        .filter((t) => t.category === budget.category)
        .reduce((sum, t) => sum + t.amount, 0);

      if (budget.limit <= 0) return;

      const usage = (spent / budget.limit) * 100;
      if (usage >= 100) {
        insights.push({
          type: "budget_exceeded",
          priority: 100,
          title: `Budget ${budget.category} exceeded`,
          description: `You've spent ${spent.toFixed(2)} / ${budget.limit.toFixed(2)} this period.`,
        });
      } else if (usage >= budget.alertThreshold) {
        insights.push({
          type: "budget_alert",
          priority: 80,
          title: `Budget ${budget.category} nearing limit`,
          description: `You are at ${usage.toFixed(0)}% of your ${budget.limit.toFixed(2)} budget.`,
        });
      }
    });

    goals.forEach((goal) => {
      const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
      if (progress >= 100) {
        insights.push({
          type: "goal_completed",
          priority: 90,
          title: `${goal.name} achieved`,
          description: `Great job! You've reached your goal of ${goal.targetAmount.toFixed(2)}.`,
        });
      } else if (progress >= 60) {
        insights.push({
          type: "goal_progress",
          priority: 70,
          title: `${goal.name} is progressing`,
          description: `${progress.toFixed(0)}% complete (${goal.currentAmount.toFixed(2)} / ${goal.targetAmount.toFixed(2)}).`,
        });
      }
    });

    const recurring = RecurringDetectionService.detectRecurring(transactions).slice(0, 3);
    recurring.forEach((item) => {
      insights.push({
        type: "recurring_detected",
        priority: 60,
        title: `Recurring expense found: ${item.description}`,
        description: `${item.frequency} • ${item.amount.toFixed(2)} • next ~${item.nextDueDate.toLocaleDateString()}`,
      });
    });

    if (!insights.length && transactions.length) {
      insights.push({
        type: "healthy",
        priority: 10,
        title: "Everything looks stable",
        description: "No critical signals detected. Keep tracking your spending patterns.",
      });
    }

    return insights.sort((a, b) => b.priority - a.priority);
  },
};
