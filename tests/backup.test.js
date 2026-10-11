import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/utils/supabaseClient.js', async importOriginal => {
  const { createFakeSupabase } = await import('./helpers/fakeSupabase.js');
  return { ...await importOriginal(), supabase: createFakeSupabase() };
});
import { supabase } from '../src/utils/supabaseClient.js';
import { transactionRow } from './helpers/fakeSupabase.js';
import { parseAccountBackup } from '../src/utils/accountExport.js';
import { BackupService } from '../src/services/backupService.js';
import { onLocalChange } from '../src/services/changeEvents.js';
import { DEFAULT_PREFERENCES } from '../src/schemas/planning.js';
const user = { uid: 'owner', emailVerified: true };
const transaction = { id: 'tx', type: 'expense', amountMinor: 1250, currency: 'EUR', description: 'Pranzo', category: 'food', dateKey: '2026-10-01' };
const backup = (overrides = {}) => ({ schemaVersion: 2, account: { uid: 'owner' }, transactions: [transaction], recurring: [], budgets: {}, preferences: DEFAULT_PREFERENCES, ...overrides });
beforeEach(() => { vi.clearAllMocks(); supabase.reset(); });
describe('backup validation', () => {
  it('accepts exported v2 records, including older backups without planning data', () => {
    const result = parseAccountBackup(JSON.stringify({ schemaVersion: 2, account: { uid: 'owner' }, transactions: [transaction] }), 'owner');
    expect(result.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.recurring).toEqual([]);
  });
  it.each([
    { schemaVersion: 1 }, { transactions: [{ ...transaction, amountMinor: 0 }] },
    { transactions: [{ ...transaction, dateKey: '2026-02-30' }] },
    { transactions: [{ ...transaction, currency: 'USD' }] }, { transactions: [transaction, transaction] },
    { recurring: [{ id: 'invalid' }] }, { budgets: { food: -1 } }, { preferences: { monthStartDay: 32 } },
  ])('rejects invalid backups: %j', override => expect(() => parseAccountBackup(backup(override), 'owner')).toThrow());
  it('rejects another account and malformed JSON', () => {
    expect(() => parseAccountBackup(backup(), 'someone-else')).toThrow('another account');
    expect(() => parseAccountBackup('{', 'owner')).toThrow();
  });
});
describe('BackupService', () => {
  it('reads all data from one fresh database snapshot instead of context caches', async () => {
    supabase.respond = () => ({ data: { transactions: [transactionRow('tx')], recurring: [], budgets: { food: 5000 }, preferences: { monthStartDay: 27 } } });
    const result = await BackupService.fetch(user, 'Ada');
    expect(result.account.displayName).toBe('Ada');
    expect(result.preferences.monthStartDay).toBe(27);
    expect(result.transactions).toHaveLength(1);
    expect(supabase.calls).toEqual([{ rpc: 'read_account_backup', args: undefined }]);
  });
  it('refuses an invalid snapshot instead of exporting an incomplete backup', async () => {
    supabase.respond = () => ({ data: { transactions: [transactionRow('tx', { amount_minor: -1 })], recurring: [], budgets: {}, preferences: {} } });
    await expect(BackupService.fetch(user)).rejects.toBeDefined();
  });
  it('restores atomically with settings disabled by default and refreshes subscriptions', async () => {
    supabase.respond = () => ({ data: { transactions: 1, recurring: 0 } });
    const changed = vi.fn();
    const stop = onLocalChange('transactions', changed);
    expect(await BackupService.restore(user, backup())).toEqual({ transactions: 1, recurring: 0 });
    expect(supabase.calls[0]).toMatchObject({ rpc: 'restore_account_backup', args: { p_restore_settings: false, p_backup: expect.objectContaining({ transactions: [transaction] }) } });
    expect(changed).toHaveBeenCalledOnce();
    stop();
  });
  it('validates before contacting the database and emits no updates on failure', async () => {
    await expect(BackupService.restore(user, backup({ account: { uid: 'other' } }))).rejects.toBeDefined();
    expect(supabase.calls).toHaveLength(0);
    supabase.respond = () => ({ error: { code: '42501', message: 'denied' } });
    const changed = vi.fn(), stop = onLocalChange('transactions', changed);
    await expect(BackupService.restore(user, backup())).rejects.toMatchObject({ code: 'permission-denied' });
    expect(changed).not.toHaveBeenCalled();
    stop();
  });
});
