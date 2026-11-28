import { z } from 'zod';
import { MAX_AMOUNT_MINOR } from '../utils/money';
import { isSupportedCurrency } from '../utils/currency';
import { isDateKey } from '../utils/dateUtils';

/** ISO 4217 code of a currency the app supports. */
export const currencyCodeSchema = z.string().refine(isSupportedCurrency, 'Unsupported currency');

export const transactionV2InputSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: currencyCodeSchema,
  description: z.string().trim().min(1).max(200),
  dateKey: z.string().refine(isDateKey, 'Invalid date key'),
  category: z.string().trim().min(1).max(60),
  type: z.enum(['income', 'expense']),
});

export const transactionV2PatchSchema = transactionV2InputSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  'At least one field is required'
);
