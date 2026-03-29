import { z } from "zod";

export const goalInputSchema = z.object({
  name: z.string().min(2),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).default(0),
  dueDate: z.date(),
  autoContribute: z.boolean().default(false),
  autoContributeAmount: z.number().min(0).default(0),
});

export const goalSchema = goalInputSchema.extend({
  userId: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});
