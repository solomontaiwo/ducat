-- Soldi Sotto: schema, row level security and helper functions.
-- Every table belongs to one user and is reachable only by that user.
-- Replay-safe bootstrap for projects initialized manually in the SQL Editor.
-- Existing tables must already match this schema; later changes need new migrations.

-- Profiles ---------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 1 and 50),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  email text check (email is null or char_length(email) <= 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transactions -----------------------------------------------------------

create table if not exists public.transactions (
  -- Text ids keep the client generated, idempotent ids (`<uid>_<requestId>`)
  -- and the ids carried over from Firestore.
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,200}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  date_key date not null,
  schema_version smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date_key desc, id desc);
create index if not exists transactions_user_type_date_idx on public.transactions (user_id, type, date_key desc);
create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category);

-- Recurring rules --------------------------------------------------------

create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  anchor_date_key date not null,
  next_index integer not null default 1 check (next_index between 0 and 10000),
  mode text not null default 'auto' check (mode in ('auto', 'confirm')),
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_user_idx on public.recurring (user_id);

-- Budgets and preferences (one row per user) -----------------------------

create table if not exists public.budgets (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  limits jsonb not null default '{}'::jsonb
    check (jsonb_typeof(limits) = 'object' and pg_column_size(limits) < 8192),
  updated_at timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Validated by the app (src/schemas/planning.js); unknown or invalid values
  -- fall back to the defaults when read.
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384),
  updated_at timestamptz not null default now()
);

-- Integrity triggers -----------------------------------------------------

-- Ownership and creation time never change; updated_at is set by the server.
create or replace function public.keep_row_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.user_id := old.user_id;
  if to_jsonb(old) ? 'created_at' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.keep_profile_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- A recurring rule only moves forward: an occurrence once registered or
-- skipped is never produced again. A late write from another device that
-- carries an older index keeps the newer one.
create or replace function public.recurring_next_index_forward() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.next_index := greatest(new.next_index, old.next_index);
  return new;
end;
$$;

create or replace trigger profiles_identity before update on public.profiles
  for each row execute function public.keep_profile_identity();
create or replace trigger transactions_identity before update on public.transactions
  for each row execute function public.keep_row_identity();
create or replace trigger recurring_identity before update on public.recurring
  for each row execute function public.keep_row_identity();
create or replace trigger recurring_forward before update on public.recurring
  for each row execute function public.recurring_next_index_forward();
create or replace trigger budgets_identity before update on public.budgets
  for each row execute function public.keep_row_identity();
create or replace trigger preferences_identity before update on public.preferences
  for each row execute function public.keep_row_identity();

-- A profile is created with every account, named after the sign-up form.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chosen text := left(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(new.email, '@', 1),
    'utente'
  )), 50);
begin
  if char_length(chosen) < 1 then
    chosen := 'utente';
  end if;
  insert into public.profiles (id, username, display_name, email)
  values (new.id, chosen, chosen, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step with the confirmed account email.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create or replace trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Row level security -----------------------------------------------------

-- Only accounts with a confirmed email reach their data, like the old
-- Firestore rules (email_verified == true).
create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and email_confirmed_at is not null
  );
$$;

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring enable row level security;
alter table public.budgets enable row level security;
alter table public.preferences enable row level security;

-- PostgreSQL has no CREATE POLICY IF NOT EXISTS; preserve existing policies.
do $$
declare
  table_name text;
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'own profile'
  ) then
    create policy "own profile" on public.profiles for all to authenticated
      using (id = (select auth.uid()))
      with check (id = (select auth.uid()));
  end if;

  foreach table_name in array array['transactions', 'recurring', 'budgets', 'preferences'] loop
    if not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = 'own ' || table_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated
          using (user_id = (select auth.uid()) and (select public.is_verified()))
          with check (user_id = (select auth.uid()) and (select public.is_verified()))',
        'own ' || table_name, table_name
      );
    end if;
  end loop;
end;
$$;

revoke all on public.profiles, public.transactions, public.recurring, public.budgets, public.preferences from anon;
grant select, insert, update, delete on public.profiles, public.transactions, public.recurring, public.budgets, public.preferences to authenticated;

-- Aggregates (run with the caller's rights, so RLS applies) --------------

create or replace function public.transaction_totals(
  p_type text default 'all',
  p_start date default null,
  p_end date default null
) returns table (count bigint, income_minor bigint, expense_minor bigint)
language sql stable security invoker set search_path = '' as $$
  select
    count(*)::bigint,
    coalesce(sum(amount_minor) filter (where type = 'income'), 0)::bigint,
    coalesce(sum(amount_minor) filter (where type = 'expense'), 0)::bigint
  from public.transactions
  where user_id = auth.uid()
    and (p_type = 'all' or type = p_type)
    and (p_start is null or date_key >= p_start)
    and (p_end is null or date_key <= p_end);
$$;

create or replace function public.transaction_category_counts()
returns table (category text, count bigint)
language sql stable security invoker set search_path = '' as $$
  select category, count(*)::bigint
  from public.transactions
  where user_id = auth.uid()
  group by category;
$$;

-- Account deletion: removes the auth user, the cascade removes the data.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.transaction_totals(text, date, date) from public, anon;
revoke execute on function public.transaction_category_counts() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.is_verified() from public, anon;
grant execute on function public.transaction_totals(text, date, date) to authenticated;
grant execute on function public.transaction_category_counts() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.is_verified() to authenticated;

-- Realtime: changes are pushed to the owner's other devices.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['transactions', 'recurring', 'budgets', 'preferences'] loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
