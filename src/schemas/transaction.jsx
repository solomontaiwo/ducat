import { z } from 'zod';
import { MAX_AMOUNT_MINOR } from '../utils/money';
import { isDateKey } from '../utils/dateUtils';

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

export const transactionV2InputSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: z.literal('EUR'),
  description: z.string().trim().min(1).max(200),
  dateKey: z.string().refine(isDateKey, 'Invalid date key'),
  category: z.string().trim().min(1).max(60),
  type: z.enum(['income', 'expense']),
});

export const transactionV2PatchSchema = transactionV2InputSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  'At least one field is required'
);
