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
