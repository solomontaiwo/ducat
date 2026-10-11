import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const root = join(import.meta.dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");
const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort().map((name) => readFileSync(join(migrationsDir, name), "utf8"));

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CAROL = "00000000-0000-4000-8000-00000000000c"; // email not confirmed

let db;

const asAdmin = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '{}', false);");
const asUser = async (uid, claims = {}) => {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec("set role authenticated;");
};
const asAnon = async () => {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '{}', false); set role anon;");
};

const transaction = (overrides = {}) => ({
  id: `${ALICE.replaceAll("-", "")}_req1`,
  user_id: ALICE,
  type: "expense",
  amount_minor: 1250,
  description: "Spesa",
  category: "food",
  date_key: "2026-10-01",
  ...overrides,
});

const insertTransaction = (row) => {
  const keys = Object.keys(row);
  return db.query(
    `insert into public.transactions (${keys.join(", ")}) values (${keys.map((_, index) => `$${index + 1}`).join(", ")}) returning *`,
    Object.values(row)
  );
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(import.meta.dirname, "supabaseStub.sql"), "utf8"));
  for (const migration of migrations) await db.exec(migration);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await asAdmin();
  await db.exec("delete from auth.users;");
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ($1, 'alice@example.com', now(), '{"display_name":"Alice"}'),
      ($2, 'bob@example.com', now(), '{}'),
      ($3, 'carol@example.com', null, '{}')`,
    [ALICE, BOB, CAROL]
  );
});

describe("initial schema migration", () => {
  it("can be replayed without changing existing data or duplicating database objects", async () => {
    await asUser(ALICE);
    await insertTransaction(transaction());
    await db.query(`insert into public.recurring (type, amount_minor, description, category, frequency, anchor_date_key)
      values ('expense', 89000, 'Affitto', 'housing', 'monthly', '2026-01-05')`);
    await db.query(`insert into public.budgets (limits) values ('{"food": 30000}')`);
    await db.query(`insert into public.preferences (data) values ('{"monthStartDay": 27}')`);
    await asAdmin();

    const tables = ["profiles", "transactions", "recurring", "budgets", "preferences"];
    const snapshot = async () => {
      const result = {};
      for (const table of tables) {
        result[table] = (await db.query(`select * from public.${table} order by 1`)).rows;
      }
      result.policies = (await db.query("select * from pg_policies where schemaname = 'public' order by tablename, policyname")).rows;
      result.triggers = (await db.query("select oid, tgname, tgrelid, tgfoid from pg_trigger where not tgisinternal order by oid")).rows;
      result.indexes = (await db.query("select * from pg_indexes where schemaname = 'public' order by tablename, indexname")).rows;
      result.realtime = (await db.query("select * from pg_publication_tables where pubname = 'supabase_realtime' order by tablename")).rows;
      return result;
    };
    const before = await snapshot();
    for (let replay = 0; replay < 2; replay += 1) {
      for (const migration of migrations) await db.exec(migration);
    }
    expect(await snapshot()).toEqual(before);

    await asUser(BOB);
    for (const table of tables) {
      const ownerColumn = table === "profiles" ? "id" : "user_id";
      expect((await db.query(`select * from public.${table} where ${ownerColumn} = $1`, [ALICE])).rows).toEqual([]);
    }
    await asAdmin();
    await db.query("insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000d', 'dave@example.com')");
    expect((await db.query("select username from public.profiles where email = 'dave@example.com'")).rows).toEqual([{ username: "dave" }]);
  });
});

describe("profiles", () => {
  it("are created with the account, named after the sign-up form", async () => {
    const { rows } = await db.query("select id, display_name, username, email from public.profiles order by email");
    expect(rows).toEqual([
      { id: ALICE, display_name: "Alice", username: "Alice", email: "alice@example.com" },
      { id: BOB, display_name: "bob", username: "bob", email: "bob@example.com" },
      { id: CAROL, display_name: "carol", username: "carol", email: "carol@example.com" },
    ]);
  });

  it("are readable and editable only by their owner", async () => {
    await asUser(ALICE);
    const { rows } = await db.query("select id from public.profiles");
    expect(rows).toEqual([{ id: ALICE }]);
    const updated = await db.query("update public.profiles set display_name = 'Ali' where id = $1 returning display_name", [ALICE]);
    expect(updated.rows).toEqual([{ display_name: "Ali" }]);
    const others = await db.query("update public.profiles set display_name = 'x' where id = $1 returning id", [BOB]);
    expect(others.rows).toEqual([]);
  });

  it("keep the creation time and follow the account email", async () => {
    const before = (await db.query("select created_at from public.profiles where id = $1", [ALICE])).rows[0].created_at;
    await asUser(ALICE);
    await db.query("update public.profiles set created_at = '2000-01-01' where id = $1", [ALICE]);
    await asAdmin();
    await db.query("update auth.users set email = 'new@example.com' where id = $1", [ALICE]);
    const after = (await db.query("select created_at, email from public.profiles where id = $1", [ALICE])).rows[0];
    expect(after.created_at).toEqual(before);
    expect(after.email).toBe("new@example.com");
  });
});

describe("transactions", () => {
  it("can be written and read by their verified owner", async () => {
    await asUser(ALICE);
    await insertTransaction(transaction());
    const { rows } = await db.query("select id, amount_minor, currency from public.transactions");
    expect(rows).toEqual([{ id: transaction().id, amount_minor: 1250, currency: "EUR" }]);
  });

  it("take the owner from the session when user_id is omitted", async () => {
    await asUser(ALICE);
    const row = transaction();
    delete row.user_id;
    const { rows } = await insertTransaction(row);
    expect(rows[0].user_id).toBe(ALICE);
  });

  it("stay invisible and untouchable for other users", async () => {
    await asUser(ALICE);
    await insertTransaction(transaction());
    await asUser(BOB);
    expect((await db.query("select * from public.transactions")).rows).toEqual([]);
    expect((await db.query("update public.transactions set amount_minor = 1 returning id")).rows).toEqual([]);
    expect((await db.query("delete from public.transactions returning id")).rows).toEqual([]);
    await expect(insertTransaction(transaction({ id: "bob_for_alice" }))).rejects.toThrow(/row-level security/);
  });

  it("are closed to accounts without a confirmed email and to anonymous visitors", async () => {
    await asUser(CAROL);
    await expect(insertTransaction(transaction({ id: "carol_1", user_id: CAROL }))).rejects.toThrow(/row-level security/);
    await asUser(ALICE);
    await insertTransaction(transaction());
    await asUser(CAROL);
    expect((await db.query("select * from public.transactions")).rows).toEqual([]);
    await asAnon();
    await expect(db.query("select * from public.transactions")).rejects.toThrow(/permission denied/);
  });

  it("reject invalid amounts, currencies, types and ids", async () => {
    await asUser(ALICE);
    await expect(insertTransaction(transaction({ id: "a1", amount_minor: 0 }))).rejects.toThrow(/check/);
    await expect(insertTransaction(transaction({ id: "a2", amount_minor: 100000001 }))).rejects.toThrow(/check/);
    await expect(insertTransaction(transaction({ id: "a3", currency: "USD" }))).rejects.toThrow(/check/);
    await expect(insertTransaction(transaction({ id: "a4", type: "transfer" }))).rejects.toThrow(/check/);
    await expect(insertTransaction(transaction({ id: "a/5" }))).rejects.toThrow(/check/);
    await expect(insertTransaction(transaction({ id: "a6", description: "  " }))).rejects.toThrow(/check/);
  });

  it("keep owner and creation time on update", async () => {
    await asUser(ALICE);
    const created = (await insertTransaction(transaction())).rows[0];
    await expect(db.query("update public.transactions set user_id = $1", [BOB])).resolves.toBeDefined();
    await db.query("update public.transactions set created_at = '2000-01-01', amount_minor = 99");
    const row = (await db.query("select user_id, created_at, amount_minor from public.transactions")).rows[0];
    expect(row).toEqual({ user_id: ALICE, created_at: created.created_at, amount_minor: 99 });
  });

  it("report the totals of the caller only", async () => {
    await asUser(ALICE);
    await insertTransaction(transaction({ id: "a1", type: "income", amount_minor: 200000, category: "salary", date_key: "2026-09-27" }));
    await insertTransaction(transaction({ id: "a2", amount_minor: 1500, date_key: "2026-10-02" }));
    await insertTransaction(transaction({ id: "a3", amount_minor: 500, date_key: "2026-11-01" }));
    await asUser(BOB);
    await insertTransaction(transaction({ id: "b1", user_id: BOB, amount_minor: 777 }));

    await asUser(ALICE);
    const all = (await db.query("select * from public.transaction_totals()")).rows[0];
    expect(all).toEqual({ count: 3, income_minor: 200000, expense_minor: 2000 });
    const october = (await db.query("select * from public.transaction_totals('expense', '2026-10-01', '2026-10-31')")).rows[0];
    expect(october).toEqual({ count: 1, income_minor: 0, expense_minor: 1500 });
    const counts = (await db.query("select * from public.transaction_category_counts() order by category")).rows;
    expect(counts).toEqual([{ category: "food", count: 2 }, { category: "salary", count: 1 }]);
  });
});

describe("recurring rules", () => {
  const insertRule = () => db.query(
    `insert into public.recurring (type, amount_minor, description, category, frequency, anchor_date_key, next_index)
     values ('expense', 89000, 'Affitto', 'housing', 'monthly', '2026-01-05', 3) returning id`
  );

  it("belong to their owner", async () => {
    await asUser(ALICE);
    const { id } = (await insertRule()).rows[0];
    await asUser(BOB);
    expect((await db.query("select * from public.recurring")).rows).toEqual([]);
    expect((await db.query("update public.recurring set paused = true where id = $1 returning id", [id])).rows).toEqual([]);
  });

  it("only move forward", async () => {
    await asUser(ALICE);
    const { id } = (await insertRule()).rows[0];
    await db.query("update public.recurring set next_index = 4 where id = $1", [id]);
    await db.query("update public.recurring set next_index = 2, paused = true where id = $1", [id]);
    const row = (await db.query("select next_index, paused from public.recurring where id = $1", [id])).rows[0];
    expect(row).toEqual({ next_index: 4, paused: true });
  });
});

describe("budgets and preferences", () => {
  it("hold one row per user, private to them", async () => {
    await asUser(ALICE);
    await db.query(`insert into public.budgets (limits) values ('{"food": 30000}')`);
    await db.query(`insert into public.preferences (data) values ('{"monthStartDay": 27}')`);
    await db.query(`insert into public.preferences (data) values ('{"monthStartDay": 1}')
      on conflict (user_id) do update set data = excluded.data`);
    expect((await db.query("select data from public.preferences")).rows).toEqual([{ data: { monthStartDay: 1 } }]);
    await asUser(BOB);
    expect((await db.query("select * from public.budgets")).rows).toEqual([]);
    expect((await db.query("select * from public.preferences")).rows).toEqual([]);
    await expect(db.query(`insert into public.budgets (user_id, limits) values ($1, '{}')`, [ALICE])).rejects.toThrow(/row-level security|duplicate/);
  });

  it("must be JSON objects", async () => {
    await asUser(ALICE);
    await expect(db.query(`insert into public.budgets (limits) values ('[1]')`)).rejects.toThrow(/check/);
  });
});

describe("account deletion", () => {
  it("removes the account and every row it owns after recent password authentication", async () => {
    await asUser(ALICE, { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] });
    await insertTransaction(transaction());
    await db.query(`insert into public.budgets (limits) values ('{}')`);
    await db.query("select public.delete_my_account()");
    await asAdmin();
    expect((await db.query("select count(*)::int as n from auth.users where id = $1", [ALICE])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.transactions")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.budgets")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.profiles where id = $1", [ALICE])).rows[0].n).toBe(0);
  });

  it("is not available to anonymous visitors", async () => {
    await asAnon();
    await expect(db.query("select public.delete_my_account()")).rejects.toThrow(/permission denied/);
  });
});

describe('atomic planning writes', () => {
  const ruleId = '00000000-0000-4000-8000-000000000011';
  const row = { ...transaction(), currency: 'EUR', date_key: '2026-01-31' };
  const add = (overrides = {}, frequency = 'monthly') => db.query(
    'select public.add_transaction_with_recurring($1, $2, $3, $4, $5)',
    ['initial', ruleId, JSON.stringify({ ...row, ...overrides }), frequency, 'confirm']
  );
  const occurrence = (index) => db.query('select public.register_recurring_occurrence($1, $2) as created', [ruleId, index]);

  it('rolls back the initial transaction if its rule is invalid', async () => {
    await asUser(ALICE);
    await expect(add({}, 'daily')).rejects.toThrow(/check/);
    expect((await db.query('select * from public.transactions')).rows).toEqual([]);
    expect((await db.query('select * from public.recurring')).rows).toEqual([]);
  });
  it('creates both records once and registers anchored month-end occurrences once', async () => {
    await asUser(ALICE);
    await add(); await add();
    expect((await db.query('select id from public.transactions')).rows).toHaveLength(1);
    expect((await occurrence(1)).rows).toEqual([{ created: true }]);
    expect((await occurrence(1)).rows).toEqual([{ created: false }]);
    await occurrence(2);
    const records = (await db.query('select id, date_key::text from public.transactions order by date_key')).rows;
    expect(records.map(item => item.date_key)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(records[1].id).toHaveLength(88);
    expect((await db.query('select next_index from public.recurring')).rows).toEqual([{ next_index: 3 }]);
  });
  it('leaves the index unchanged when inserting an occurrence fails', async () => {
    await asUser(BOB);
    await insertTransaction(transaction({ id: `${ALICE}_rec-${ruleId}-2026-02-28`, user_id: BOB }));
    await asUser(ALICE);
    await add();
    await expect(occurrence(1)).rejects.toThrow(/unavailable|row-level security/);
    expect((await db.query('select next_index from public.recurring')).rows).toEqual([{ next_index: 1 }]);
  });
  it('rejects skipped future indices, paused rules and rules owned by another user', async () => {
    await asUser(ALICE); await add();
    await expect(occurrence(2)).rejects.toThrow(/changed/);
    await db.query('update public.recurring set paused = true');
    await expect(occurrence(1)).rejects.toThrow(/changed/);
    await asUser(BOB);
    await expect(occurrence(1)).rejects.toThrow(/unavailable/);
    await expect(add()).rejects.toThrow(/unavailable|row-level security/);
    await asUser(CAROL);
    await expect(add()).rejects.toThrow(/row-level security/);
    await asAnon();
    await expect(occurrence(1)).rejects.toThrow(/permission denied/);
    await expect(add()).rejects.toThrow(/permission denied/);
  });
  it('merges preference patches instead of replacing other fields', async () => {
    await asUser(ALICE);
    await db.query(`select public.save_preferences_patch('{"monthStartDay":27,"quickAmounts":[5,10]}')`);
    await db.query(`select public.save_preferences_patch('{"hiddenCategories":["food"]}')`);
    expect((await db.query('select data from public.preferences')).rows[0].data).toEqual({ monthStartDay: 27, quickAmounts: [5, 10], hiddenCategories: ['food'] });
    await asUser(BOB);
    expect((await db.query(`select public.save_preferences_patch('{"monthStartDay":1}') as data`)).rows[0].data).toEqual({ monthStartDay: 1 });
    await asUser(CAROL);
    await expect(db.query(`select public.save_preferences_patch('{}')`)).rejects.toThrow(/row-level security/);
  });
});

describe('backup snapshot and restore', () => {
  const backup = (overrides = {}) => ({
    schemaVersion: 2, account: { uid: ALICE }, transactions: [{ id: 'restored', type: 'expense', amountMinor: 1250, currency: 'EUR', description: 'Spesa', category: 'food', dateKey: '2026-10-01' }],
    recurring: [{ id: '00000000-0000-4000-8000-000000000012', type: 'expense', amountMinor: 1250, currency: 'EUR', description: 'Spesa', category: 'food', anchorDateKey: '2026-10-01', frequency: 'weekly', nextIndex: 1, mode: 'confirm', paused: false }],
    budgets: { food: 9000 }, preferences: { monthStartDay: 27 }, ...overrides,
  });
  const restore = (value, settings = false) => db.query('select public.restore_account_backup($1, $2) as result', [JSON.stringify(value), settings]);
  it('includes the complete private history and planning data in a single snapshot', async () => {
    await asUser(ALICE);
    await restore(backup(), true);
    await db.query(`insert into public.transactions (id, type, amount_minor, description, category, date_key)
      select 'many-' || n, 'expense', 1, 'Test', 'food', '2026-10-01'::date from generate_series(1, 1005) n`);
    await asUser(BOB); await insertTransaction(transaction({ id: 'bob', user_id: BOB }));
    await asUser(ALICE);
    const result = (await db.query('select public.read_account_backup() as result')).rows[0].result;
    expect(result.transactions).toHaveLength(1006);
    expect(result.transactions.some(row => row.id === 'bob')).toBe(false);
    expect(result.recurring).toHaveLength(1);
    expect(result.budgets).toEqual({ food: 9000 });
    expect(result.preferences).toEqual({ monthStartDay: 27 });
    await asUser(CAROL);
    await expect(db.query('select public.read_account_backup()')).rejects.toThrow(/verified/);
    await asAnon();
    await expect(db.query('select public.read_account_backup()')).rejects.toThrow(/permission denied/);
  });
  it('restores only missing records, preserves duplicates, and restores settings only when selected', async () => {
    await asUser(ALICE);
    await db.query(`select public.save_preferences_patch('{"monthStartDay":1}')`);
    expect((await restore(backup())).rows[0].result).toEqual({ transactions: 1, recurring: 1 });
    await db.query(`update public.transactions set amount_minor = 555 where id = 'restored'`);
    expect((await restore(backup())).rows[0].result).toEqual({ transactions: 0, recurring: 0 });
    expect((await db.query('select amount_minor from public.transactions')).rows).toEqual([{ amount_minor: 555 }]);
    expect((await db.query('select data from public.preferences')).rows[0].data).toEqual({ monthStartDay: 1 });
    await restore(backup(), true);
    expect((await db.query('select data from public.preferences')).rows[0].data).toEqual({ monthStartDay: 27 });
  });
  it('rolls back all writes when a later record or the settings are invalid', async () => {
    await asUser(ALICE);
    const valid = backup();
    await expect(restore(backup({ recurring: [{ ...valid.recurring[0], amountMinor: -1 }] }))).rejects.toThrow(/check/);
    await expect(restore(backup({ preferences: [] }), true)).rejects.toThrow(/invalid backup settings/);
    expect((await db.query('select * from public.transactions')).rows).toEqual([]);
    expect((await db.query('select * from public.recurring')).rows).toEqual([]);
    expect((await db.query('select * from public.budgets')).rows).toEqual([]);
  });
  it('rejects different accounts, unverified users and anonymous calls', async () => {
    await asUser(BOB); await expect(restore(backup())).rejects.toThrow(/another account/);
    await asUser(CAROL); await expect(restore(backup({ account: { uid: CAROL } }))).rejects.toThrow(/another account/);
    await asAnon(); await expect(restore(backup())).rejects.toThrow(/permission denied/);
  });
});

describe('server-enforced recent authentication', () => {
  it.each([
    {}, { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 180 }] },
    { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) + 180 }] },
    { amr: [{ method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) }] },
    { amr: [{ method: 'password', timestamp: 'not-a-time' }] }, { amr: 'password' },
  ])('rejects deletion without a recent signed password authentication: %j', async claims => {
    await asUser(ALICE, claims);
    await expect(db.query('select public.delete_my_account()')).rejects.toThrow(/recent password/);
    await asAdmin();
    expect((await db.query('select id from auth.users where id = $1', [ALICE])).rows).toHaveLength(1);
  });
});
