import { expect, it, vi } from 'vitest';
vi.mock('../src/utils/supabaseClient.js',async(importOriginal)=>{
 const {createFakeSupabase}=await import('./helpers/fakeSupabase.js');
 return {...await importOriginal(),supabase:createFakeSupabase()};
});
import {supabase} from '../src/utils/supabaseClient.js';
import {TransactionService} from '../src/services/transactionService.jsx';
it('preserves the complete recurring transaction ID in pagination cursors',async()=>{
 const id='00000000-0000-4000-8000-00000000000a_rec-00000000-0000-4000-8000-00000000000b-2026-10-01';
 await TransactionService.fetchPage('owner',{cursor:{dateKey:'2026-10-01',id}});
 const filter=supabase.calls[0].filters.find(([method])=>method==='or')[1];
 expect(id.length).toBe(88);expect(filter).toContain('id.lt.'+id);
});

it.each(['bad,filter', 'x'.repeat(201), '', 'x)'])('rejects invalid cursor IDs: %s', async (id) => {
 await expect(TransactionService.fetchPage('owner', {cursor:{dateKey:'2026-10-01',id}})).rejects.toMatchObject({code:'invalid-argument'});
});

it.each([["amount-desc", "lt"], ["amount-asc", "gt"]])("continues %s on amount, date and id within the category", async (sortBy, op) => {
  const row = { id: "a", date_key: "2026-10-01", type: "expense", amount_minor: 105 };
  supabase.respond = () => ({ data: [row] });
  const options = { sortBy, category: "casa", pageSize: 1 };
  const first = await TransactionService.fetchPage("owner", options);
  await TransactionService.fetchPage("owner", { ...options, cursor: first.nextCursor });
  const { filters } = supabase.calls.at(-1);
  expect(filters).toContainEqual(["eq", "category", "casa"]);
  expect(filters.filter(([method]) => method === "order").map(([, field]) => field)).toEqual(["amount_minor", "date_key", "id"]);
  expect(filters).toContainEqual(["or", `amount_minor.${op}.105,and(amount_minor.eq.105,or(date_key.lt.2026-10-01,and(date_key.eq.2026-10-01,id.lt.a)))`]);
});
