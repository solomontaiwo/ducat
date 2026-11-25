import { sanitizeAmountInput } from "./amountExpression.js";

/**
 * Parses safe prefill fields from `?quickAdd=1&type=...&amount=...&description=...&category=...`
 * used by iOS Home Screen Quick Actions and Apple Shortcuts (`ducat://quick-add?...`).
 */
export const parseQuickAddSearch = (search) => {
  const params = new URLSearchParams(search || "");
  if (!params.has("quickAdd")) return null;
  const rawType = params.get("type");
  const type = rawType === "income" ? "income" : rawType === "expense" ? "expense" : undefined;
  const rawAmount = params.get("amount");
  const amount = rawAmount ? sanitizeAmountInput(rawAmount).slice(0, 24) : undefined;
  const rawDesc = params.get("description") || params.get("desc") || "";
  const description = rawDesc ? rawDesc.trim().slice(0, 200) : undefined;
  const rawCategory = params.get("category") || "";
  const category = rawCategory ? rawCategory.trim().slice(0, 60) : undefined;
  return {
    ...(type ? { type } : {}),
    ...(amount ? { amount } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
  };
};

/** Builds the internal dashboard URL that opens the prefilled transaction modal. */
export const buildQuickAddPath = (paramsInput) => {
  const source = paramsInput instanceof URLSearchParams ? paramsInput : new URLSearchParams(paramsInput || "");
  const next = new URLSearchParams({ quickAdd: "1" });
  const type = source.get("type");
  if (type === "expense" || type === "income") next.set("type", type);
  const amount = source.get("amount");
  if (amount) next.set("amount", sanitizeAmountInput(amount).slice(0, 24));
  const description = source.get("description") || source.get("desc");
  if (description) next.set("description", description.trim().slice(0, 200));
  const category = source.get("category");
  if (category) next.set("category", category.trim().slice(0, 60));
  return `/dashboard?${next.toString()}`;
};
