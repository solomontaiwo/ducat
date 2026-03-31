import { RecurringDetectionService } from "./recurringDetectionService.jsx";

export const InsightsService = {
  generate({ transactions, goals = [] }) {
    const insights = [];

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
