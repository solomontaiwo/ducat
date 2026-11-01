import { z } from 'zod';
import { MAX_AMOUNT_MINOR } from '../utils/money';
import { isDateKey } from '../utils/dateUtils';

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
