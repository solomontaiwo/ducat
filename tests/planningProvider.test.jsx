import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanningProvider, usePlanning } from '../src/context/PlanningProvider.jsx';
const mocks=vi.hoisted(()=>({failLoads:false,save:vi.fn(),notification:{error:vi.fn(),info:vi.fn(),success:vi.fn()},add:vi.fn(),register:vi.fn(),rules:[],user:{uid:'owner',emailVerified:true},t:k=>k}));
vi.mock('../src/context/AuthProvider.jsx',()=>({useAuth:()=>({currentUser:mocks.user})}));
vi.mock('../src/context/UnifiedTransactionProvider.jsx',()=>({useUnifiedTransactions:()=>({isDemo:false,addTransaction:mocks.add})}));
vi.mock('../src/utils/notificationUtils.jsx',()=>({useNotification:()=>mocks.notification}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:mocks.t})}));
vi.mock('../src/services/planningService.js',()=>({PlanningService:{
 subscribeRecurring:(id,cb,err)=>{mocks.failLoads?err(new Error('offline')):cb(mocks.rules);return()=>{};},
 subscribeBudgets:(id,cb,err)=>{mocks.failLoads?err(new Error('offline')):cb({casa:10000});return()=>{};},
 subscribePreferences:(id,cb,err)=>{mocks.failLoads?err(new Error('offline')):cb({monthStartDay:1});return()=>{};},
 savePreferences:mocks.save, registerOccurrence:mocks.register
}}));
beforeEach(()=>{vi.clearAllMocks();mocks.failLoads=false;mocks.rules=[];mocks.user={uid:'owner',emailVerified:true};vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps active preferences unchanged when a save fails',async()=>{
 mocks.save.mockRejectedValue(new Error('offline'));
 const {result}=renderHook(()=>usePlanning(),{wrapper:PlanningProvider});
 await waitFor(()=>expect(result.current.ready).toBe(true));
 let ok;await act(async()=>{ok=await result.current.savePreferences({monthStartDay:27});});
 expect(ok).toBe(false);expect(result.current.preferences.monthStartDay).toBe(1);
});
it('blocks writes and exposes retry after failed planning loads',async()=>{
 mocks.failLoads=true;
 const {result}=renderHook(()=>usePlanning(),{wrapper:PlanningProvider});
 await waitFor(()=>expect(result.current.error).toBe("planning.loadError"));
 expect(result.current.ready).toBe(false);
 await act(async()=>{expect(await result.current.saveBudgets({})).toBe(false);expect(await result.current.savePreferences({monthStartDay:27})).toBe(false);});
 expect(mocks.save).not.toHaveBeenCalled();
 mocks.failLoads=false;act(()=>result.current.retry());
 await waitFor(()=>expect(result.current.ready).toBe(true));
 expect(result.current.budgets).toEqual({casa:10000});expect(result.current.recurring).toEqual([]);
});

it('serializes preference patches and applies only confirmed saved values', async () => {
 let saved = { monthStartDay: 1 };
 mocks.save.mockImplementation(async (_id, patch) => { saved = {...saved, ...patch}; return saved; });
 const {result} = renderHook(() => usePlanning(), {wrapper:PlanningProvider});
 await waitFor(() => expect(result.current.ready).toBe(true));
 await act(async () => {
  expect(await Promise.all([result.current.savePreferences({monthStartDay:27}),result.current.savePreferences({hiddenCategories:['food']})])).toEqual([true,true]);
 });
 expect(result.current.preferences).toMatchObject({monthStartDay:27,hiddenCategories:['food']});
 expect(mocks.save.mock.calls.map(call => call[1])).toEqual([{monthStartDay:27},{hiddenCategories:['food']}]);
});
it('ignores a save response after switching accounts', async () => {
 let resolve; mocks.save.mockReturnValue(new Promise(done => {resolve=done;}));
 const {result,rerender} = renderHook(() => usePlanning(), {wrapper:PlanningProvider});
 await waitFor(() => expect(result.current.ready).toBe(true));
 let pending;act(() => {pending=result.current.savePreferences({monthStartDay:27});});
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 mocks.user={uid:'new-owner',emailVerified:true};rerender();
 await act(async () => {resolve({monthStartDay:27});expect(await pending).toBe(false);});
 await waitFor(() => expect(result.current.ready).toBe(true));
 expect(result.current.preferences.monthStartDay).toBe(1);
});
it('advances confirmed occurrences locally and completes catch-up without waiting for Realtime', async () => {
 const today = new Date();
 const anchor = new Date(today.getFullYear(),today.getMonth()-30,1);
 const key = [anchor.getFullYear(),String(anchor.getMonth()+1).padStart(2,'0'),'01'].join('-');
 mocks.rules=[{id:'rule',type:'expense',amountMinor:100,currency:'EUR',description:'Test',category:'food',frequency:'monthly',anchorDateKey:key,nextIndex:1,mode:'auto',paused:false}];
 mocks.register.mockResolvedValue(true);
 const {result} = renderHook(() => usePlanning(),{wrapper:PlanningProvider});
 await waitFor(() => expect(result.current.recurring[0]?.nextIndex).toBe(31));
 expect(mocks.register.mock.calls.map(call => call[1])).toEqual(Array.from({length:30},(_,index)=>index+1));
 expect(mocks.add).not.toHaveBeenCalled();
});
it('stops catch-up on a failed atomic write without advancing the rule', async () => {
 mocks.rules=[{id:'rule',type:'expense',amountMinor:100,currency:'EUR',description:'Test',category:'food',frequency:'monthly',anchorDateKey:'2020-01-01',nextIndex:1,mode:'auto',paused:false}];
 mocks.register.mockRejectedValue(new Error('offline'));
 const {result} = renderHook(() => usePlanning(),{wrapper:PlanningProvider});
 await waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
 expect(result.current.recurring[0].nextIndex).toBe(1);
});
