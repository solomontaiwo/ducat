import { z } from 'zod';

export const transactionSchema = z.object({
  amount: z.number().finite("Amount must be finite").positive("Amount must be positive").max(1000000, "Amount is too large"),
  description: z.string().trim().min(1, "Description is required").max(200, "Description is too long"),
  date: z.date(),
  category: z.string().trim().min(1, "Category is required").max(60, "Category is too long"),
  type: z.enum(['income', 'expense']),
  userId: z.string().optional(), // Optional because it's added by the service
  createdAt: z.any().optional(), // Firebase server timestamp
});

export const transactionInputSchema = transactionSchema.omit({ 
  userId: true, 
  createdAt: true 
});
