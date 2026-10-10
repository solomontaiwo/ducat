import { vi } from "vitest";

/**
 * A stand-in for the supabase-js client. Every query is recorded as a plain
 * object and answered by `fake.respond(call)`, which tests replace.
 *
 *   call = { table, action, payload, options, filters: [[method, ...args]], rpc, args }
 */
export const createFakeSupabase = () => {
  const fake = {
    calls: [],
    respond: () => ({ data: [], error: null }),
    channels: [],
  };

  const resolve = (call) => {
    fake.calls.push(call);
    return Promise.resolve().then(() => fake.respond(call)).then((response) => ({
      data: null, error: null, count: null, ...response,
    }));
  };

  const builder = (table) => {
    const call = { table, action: "select", filters: [], payload: undefined, options: undefined };
    const chain = {
      then: (onFulfilled, onRejected) => resolve(call).then(onFulfilled, onRejected),
    };
    const record = (method) => (...args) => { call.filters.push([method, ...args]); return chain; };
    for (const method of ["eq", "neq", "gte", "lte", "lt", "gt", "or", "order", "limit", "range", "in", "is"]) {
      chain[method] = record(method);
    }
    for (const action of ["select", "insert", "update", "upsert", "delete"]) {
      chain[action] = (payload, options) => {
        if (action === "select" && call.action !== "select") {
          call.returning = payload ?? "*";
        } else {
          call.action = action;
          if (action === "select") {
            call.columns = payload;
            call.options = options;
          } else {
            call.payload = payload;
            call.options = options;
          }
        }
        return chain;
      };
    }
    chain.single = () => { call.single = true; return chain; };
    chain.maybeSingle = () => { call.maybeSingle = true; return chain; };
    return chain;
  };

  fake.from = vi.fn((table) => builder(table));
  fake.rpc = vi.fn((name, args) => resolve({ rpc: name, args }));
  fake.channel = vi.fn((name) => {
    const channel = { name, handlers: [] };
    channel.on = vi.fn((_type, _filter, handler) => { channel.handlers.push(handler); return channel; });
    channel.subscribe = vi.fn(() => channel);
    fake.channels.push(channel);
    return channel;
  });
  fake.removeChannel = vi.fn();
  fake.auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  };
  fake.reset = () => {
    fake.calls.length = 0;
    fake.channels.length = 0;
    fake.respond = () => ({ data: [], error: null });
  };
  return fake;
};

/** A database row as PostgREST returns it. */
export const transactionRow = (id, overrides = {}) => ({
  id,
  user_id: "owner",
  type: "expense",
  amount_minor: 100,
  currency: "EUR",
  description: "Caffè",
  category: "altro",
  date_key: "2026-09-06",
  schema_version: 2,
  created_at: "2026-09-06T10:00:00Z",
  updated_at: "2026-09-06T10:00:00Z",
  ...overrides,
});
