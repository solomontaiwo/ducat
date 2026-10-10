// This file contains categories for expenses and incomes in a React application.
// We import the `useMemo` hook from React to optimize category calculation.
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { usePlanning } from "../context/PlanningProvider.jsx";

/** Applies the user's order: listed values first, in that order, then the rest; "altro" stays last. */
export const orderCategories = (categories, order = []) => {
  const rank = new Map(order.map((value, index) => [value, index]));
  return [...categories].sort((first, second) => {
    if (first.value === "altro") return 1;
    if (second.value === "altro") return -1;
    const a = rank.has(first.value) ? rank.get(first.value) : Infinity;
    const b = rank.has(second.value) ? rank.get(second.value) : Infinity;
    if (a === b) return categories.indexOf(first) - categories.indexOf(second);
    return a - b;
  });
};

// Create a custom hook called `useCategories` that returns expense and income categories.
export const useCategories = () => {
  const { t } = useTranslation();

  // Expense categories: daily priority
  const expenseCategories = useMemo(
    () => [
      { value: "supermercato", label: t('categories.supermercato') },
      { value: "alimentazione", label: t('categories.alimentazione') },
      { value: "trasporti", label: t('categories.trasporti') },
      { value: "casa", label: t('categories.casa') },
      { value: "abbonamenti", label: t('categories.abbonamenti') },
      { value: "shopping", label: t('categories.shopping') },
      { value: "salute", label: t('categories.salute') },
      { value: "intrattenimento", label: t('categories.intrattenimento') },
      { value: "viaggi", label: t('categories.viaggi') },
      { value: "tasse", label: t('categories.tasse') },
      { value: "altro", label: t('categories.altro') },
    ],
    [t]
  );

  // Income categories: salary/freelance priority
  const incomeCategories = useMemo(
    () => [
      { value: "stipendio", label: t('categories.stipendio') },
      { value: "freelance", label: t('categories.freelance') },
      { value: "bonus", label: t('categories.bonus') },
      { value: "vendite", label: t('categories.vendite') },
      { value: "rimborso", label: t('categories.rimborso') },
      { value: "investimenti", label: t('categories.investimenti') },
      { value: "regalo", label: t('categories.regalo') },
      { value: "altro", label: t('categories.altro') },
    ],
    [t]
  );

  const { preferences } = usePlanning();
  const order = preferences?.categoryOrder;
  const hidden = preferences?.hiddenCategories;

  return useMemo(() => {
    const hiddenSet = new Set(hidden || []);
    const expense = orderCategories(expenseCategories, order?.expense);
    const income = orderCategories(incomeCategories, order?.income);
    // "altro" can never be hidden: it is the fallback for everything.
    const visible = (list) => list.filter((item) => item.value === "altro" || !hiddenSet.has(item.value));
    return {
      expenseCategories: expense,
      incomeCategories: income,
      visibleExpenseCategories: visible(expense),
      visibleIncomeCategories: visible(income),
    };
  }, [expenseCategories, incomeCategories, order, hidden]);
};
