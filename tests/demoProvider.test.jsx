import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DemoProvider, useDemo } from '../src/context/DemoProvider.jsx';
const mocks = vi.hoisted(() => ({ t: key => key, notification: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('../src/utils/notificationUtils.jsx', () => ({ useNotification: () => mocks.notification }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
const transaction = { type: 'expense', amountMinor: 1000, currency: 'EUR', description: 'Saved user movement', category: 'altro', dateKey: '2026-01-31' };
const ruleId = '00000000-0000-4000-8000-00000000000a';
const wrapper = ({ children }) => <DemoProvider seedOnMount>{children}</DemoProvider>;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
it('preserves saved transactions when starting demo again', async () => {
  localStorage.setItem('ducat-demo-transactions', JSON.stringify([{ ...transaction, id: 'saved', isSample: false }]));
  const { result } = renderHook(() => useDemo(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.transactions.map(item => item.id)).toEqual(['saved']);
  expect(localStorage.getItem('ducat-demo-transactions')).toContain('Saved user movement');
});
it('seeds only an empty demo and keeps retry IDs stable', async () => {
  const { result } = renderHook(() => useDemo(), { wrapper });
  await waitFor(() => expect(result.current.transactions).toHaveLength(3));
  await act(async () => {
    expect(await result.current.addTransaction({ ...transaction, clientRequestId: 'request' })).toBe(true);
    expect(await result.current.addTransaction({ ...transaction, clientRequestId: 'request' })).toBe(true);
  });
  expect(result.current.transactions).toHaveLength(4);
});
it('persists an initial movement with its rule and consumes each occurrence once', async () => {
  const { result } = renderHook(() => useDemo(), { wrapper: DemoProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const payload = { ...transaction, clientRequestId: 'request', recurring: { id: ruleId, frequency: 'monthly', mode: 'confirm' } };
  await act(async () => {
    expect(await result.current.addTransaction(payload)).toBe(true);
    expect(await result.current.addTransaction(payload)).toBe(true);
    expect(await result.current.addTransaction({ recurringOccurrence: { id: ruleId, index: 1 } })).toBe(true);
    expect(await result.current.addTransaction({ recurringOccurrence: { id: ruleId, index: 1 } })).toBe(true);
  });
  expect(result.current.transactions).toHaveLength(2);
  expect(result.current.transactions[0]).toMatchObject({ dateKey: '2026-02-28', amountMinor: 1000 });
  expect(JSON.parse(localStorage.getItem('ducat-demo-recurring'))).toEqual([expect.objectContaining({ id: ruleId, nextIndex: 2 })]);
});
it('rolls back the movement when storing its recurring rule fails', async () => {
  const { result } = renderHook(() => useDemo(), { wrapper: DemoProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === 'ducat-demo-recurring') throw new Error('quota');
    return original.call(this, key, value);
  });
  await act(async () => expect(await result.current.addTransaction({ ...transaction, recurring: { id: ruleId, frequency: 'monthly', mode: 'auto' } })).toBe(false));
  expect(result.current.transactions).toEqual([]);
  expect(localStorage.getItem('ducat-demo-transactions')).toBeNull();
  expect(localStorage.getItem('ducat-demo-recurring')).toBeNull();
});
it('keeps ordinary additions available even if recurring storage is malformed', async () => {
  localStorage.setItem('ducat-demo-recurring', '{broken');
  const { result } = renderHook(() => useDemo(), { wrapper: DemoProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => expect(await result.current.addTransaction(transaction)).toBe(true));
  expect(result.current.transactions).toHaveLength(1);
  expect(localStorage.getItem('ducat-demo-recurring')).toBe('{broken');
});
