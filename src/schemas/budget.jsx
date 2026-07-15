import { z } from "zod";

export const budgetInputSchema = z.object({
  category: z.string().min(1),
  limit: z.number().positive(),
  period: z.enum(["monthly", "weekly", "yearly"]).default("monthly"),
  alertThreshold: z.number().min(1).max(100).default(80),
});
