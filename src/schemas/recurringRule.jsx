import { z } from "zod";

export const recurringRuleInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().min(1),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  nextDueDate: z.date(),
  active: z.boolean().default(true),
});
