-- The server stores encrypted records and serializes changes per account.
create table if not exists public.vault_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keys jsonb not null check (coalesce(
    jsonb_typeof(keys) = 'object' and octet_length(keys::text) < 4096
    and keys - array['v', 'salt', 'password', 'recovery'] = '{}'::jsonb
    and keys->'v' = '1'::jsonb
    and keys->>'salt' ~ '^[A-Za-z0-9+/]{22}==$'
    and keys->>'password' ~ '^[A-Za-z0-9+/]{80}$'
    and keys->>'recovery' ~ '^[A-Za-z0-9+/]{80}$', false
  )),
  active boolean not null default false,
  revision bigint not null default 0
);

create table if not exists public.vault_records (
  user_id uuid not null references public.vault_accounts(user_id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{64}$'),
  revision bigint not null,
  ciphertext text check (octet_length(ciphertext) between 40 and 65536),
  primary key (user_id, id)
);
create index if not exists vault_records_sync on public.vault_records (user_id, revision, id);

alter table public.vault_accounts enable row level security;
alter table public.vault_records enable row level security;
revoke all on public.vault_accounts, public.vault_records from public, anon, authenticated;
grant select on public.vault_accounts, public.vault_records to authenticated;
drop policy if exists vault_owner on public.vault_accounts;
create policy vault_owner on public.vault_accounts for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_verified()));
drop policy if exists vault_owner on public.vault_records;
create policy vault_owner on public.vault_records for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_verified()));

-- Starting migration lets pending legacy writes finish before freezing this account.
create or replace function public.start_vault(p_user uuid, p_keys jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  if exists (select 1 from public.vault_accounts where user_id = p_user) then return false; end if;
  lock table public.transactions, public.recurring, public.budgets, public.preferences in share row exclusive mode;
  insert into public.vault_accounts (user_id, keys) values (auth.uid(), p_keys)
    on conflict (user_id) do nothing;
  return found;
end;
$$;

create or replace function public.guard_legacy_vault_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and exists (
    select 1 from public.vault_accounts
    where user_id in (case when tg_op <> 'INSERT' then old.user_id end,
                      case when tg_op <> 'DELETE' then new.user_id end)
  ) then
    raise exception 'legacy writes disabled for this archive' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace trigger vault_legacy_guard before insert or update or delete on public.transactions
  for each row execute function public.guard_legacy_vault_write();
create or replace trigger vault_legacy_guard before insert or update or delete on public.recurring
  for each row execute function public.guard_legacy_vault_write();
create or replace trigger vault_legacy_guard before insert or update or delete on public.budgets
  for each row execute function public.guard_legacy_vault_write();
create or replace trigger vault_legacy_guard before insert or update or delete on public.preferences
  for each row execute function public.guard_legacy_vault_write();

-- A null ciphertext is a tombstone. A revision covers the entire batch, so
-- dependent writes (for example an occurrence and its rule) commit together.
create or replace function public.write_vault(p_user uuid, p_revision bigint, p_active boolean, p_changes jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  account public.vault_accounts%rowtype;
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  select * into account from public.vault_accounts where user_id = auth.uid() for update;
  if not found then raise exception 'archive unavailable' using errcode = '42501'; end if;
  if account.active is distinct from p_active or account.revision is distinct from p_revision then return false; end if;
  if jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 110002 then
    raise exception 'invalid archive batch' using errcode = '22023';
  end if;

  update public.vault_accounts set revision = revision + 1 where user_id = account.user_id;
  insert into public.vault_records (user_id, id, revision, ciphertext)
    select account.user_id, entry.id, account.revision + 1, entry.ciphertext
    from jsonb_to_recordset(p_changes) as entry(id text, ciphertext text)
    on conflict (user_id, id) do update set revision = excluded.revision, ciphertext = excluded.ciphertext;
  return true;
end;
$$;

-- Read one bounded page at a time. The client advances to a new revision
-- only after it has processed every page through its captured upper bound.
create or replace function public.read_vault_changes(p_user uuid, p_after bigint, p_id text, p_through bigint)
returns table (id text, revision bigint, ciphertext text)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.revision, r.ciphertext from public.vault_records r
  where r.user_id = p_user and p_user = auth.uid() and (r.revision, r.id) > (p_after, p_id) and r.revision <= p_through
  order by r.revision, r.id limit 500
$$;

create or replace function public.read_vault_legacy(p_user uuid, p_kind text, p_id text)
returns table (kind text, id text, value jsonb)
language sql stable security invoker set search_path = '' as $$
  select source.kind, source.id, source.value from (
    select 'transactions' as kind, t.id, to_jsonb(t) as value from public.transactions t where t.user_id = p_user
    union all select 'recurring', r.id::text, to_jsonb(r) from public.recurring r where r.user_id = p_user
    union all select 'budgets', 'settings', b.limits from public.budgets b where b.user_id = p_user
    union all select 'preferences', 'settings', p.data from public.preferences p where p.user_id = p_user
  ) as source
  where p_user = auth.uid() and (source.kind, source.id) > (p_kind, p_id)
    and exists (select 1 from public.vault_accounts where user_id = p_user and not active)
  order by source.kind, source.id limit 500
$$;

create or replace function public.finish_vault(p_user uuid, p_revision bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  account public.vault_accounts%rowtype;
  expected bigint;
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  select * into account from public.vault_accounts where user_id = auth.uid() for update;
  if not found then raise exception 'archive unavailable' using errcode = '42501'; end if;
  if account.active or account.revision is distinct from p_revision then return false; end if;
  expected := (select count(*) from public.transactions where user_id = account.user_id)
    + (select count(*) from public.recurring where user_id = account.user_id)
    + (select count(*) from public.budgets where user_id = account.user_id)
    + (select count(*) from public.preferences where user_id = account.user_id);
  if expected <> (select count(*) from public.vault_records where user_id = account.user_id and ciphertext is not null) then
    raise exception 'incomplete archive' using errcode = '22023';
  end if;

  -- Postgres Changes can broadcast a deleted row's primary key without RLS.
  -- Legacy transaction IDs can contain the owner and occurrence date.
  update public.transactions set id = 'retired_' || gen_random_uuid()::text where user_id = account.user_id;
  delete from public.transactions where user_id = account.user_id;
  delete from public.recurring where user_id = account.user_id;
  delete from public.budgets where user_id = account.user_id;
  delete from public.preferences where user_id = account.user_id;
  update public.vault_accounts set active = true where user_id = account.user_id;
  return true;
end;
$$;

revoke execute on function public.start_vault(uuid, jsonb), public.write_vault(uuid, bigint, boolean, jsonb),
  public.read_vault_changes(uuid, bigint, text, bigint), public.read_vault_legacy(uuid, text, text), public.finish_vault(uuid, bigint), public.guard_legacy_vault_write() from public, anon;
grant execute on function public.start_vault(uuid, jsonb), public.write_vault(uuid, bigint, boolean, jsonb),
  public.read_vault_changes(uuid, bigint, text, bigint), public.read_vault_legacy(uuid, text, text), public.finish_vault(uuid, bigint) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'vault_accounts') then
    alter publication supabase_realtime add table public.vault_accounts;
  end if;
end;
$$;
