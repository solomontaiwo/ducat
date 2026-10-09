import { z } from "zod";
import { MAX_AMOUNT_MINOR } from "../utils/money";
import { isDateKey } from "../utils/dateUtils";

export const recurringInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: z.literal("EUR"),
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(60),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  anchorDateKey: z.string().refine(isDateKey, "Invalid date key"),
  nextIndex: z.number().int().min(0).max(10000),
  mode: z.enum(["auto", "confirm"]),
  paused: z.boolean(),
});

export const recurringPatchSchema = recurringInputSchema
  .pick({ nextIndex: true, paused: true, mode: true, amountMinor: true })
  .partial();

/** Category -> monthly limit in cents. Zero or missing means "no budget". */
export const budgetLimitsSchema = z.record(
  z.string().min(1).max(60),
  z.number().int().positive().max(MAX_AMOUNT_MINOR)
).refine((limits) => Object.keys(limits).length <= 40, "Too many budgets");
