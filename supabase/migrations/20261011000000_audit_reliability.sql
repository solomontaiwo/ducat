-- Atomic writes, consistent backups and server-enforced account reauthentication.

create or replace function public.add_transaction_with_recurring(
  p_id text, p_rule_id uuid, p_transaction jsonb, p_frequency text, p_mode text
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.transactions (id, user_id, type, amount_minor, currency, description, category, date_key)
  values (p_id, auth.uid(), p_transaction->>'type', (p_transaction->>'amount_minor')::bigint,
    p_transaction->>'currency', p_transaction->>'description', p_transaction->>'category',
    (p_transaction->>'date_key')::date)
  on conflict (id) do nothing;
  if not exists (select 1 from public.transactions where id = p_id and user_id = auth.uid()) then
    raise exception 'transaction unavailable' using errcode = '42501';
  end if;

  insert into public.recurring (id, user_id, type, amount_minor, currency, description, category,
    frequency, anchor_date_key, next_index, mode, paused)
  values (p_rule_id, auth.uid(), p_transaction->>'type', (p_transaction->>'amount_minor')::bigint,
    p_transaction->>'currency', p_transaction->>'description', p_transaction->>'category',
    p_frequency, (p_transaction->>'date_key')::date, 1, p_mode, false)
  on conflict (id) do nothing;
  if not exists (select 1 from public.recurring where id = p_rule_id and user_id = auth.uid()) then
    raise exception 'recurring rule unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.register_recurring_occurrence(p_rule_id uuid, p_index integer)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  rule public.recurring%rowtype;
  occurrence_date date;
  transaction_id text;
  inserted integer;
begin
  select * into rule from public.recurring where id = p_rule_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'recurring rule unavailable' using errcode = '42501';
  end if;
  if p_index is null or p_index < 0 or p_index >= 10000 then
    raise exception 'invalid occurrence index' using errcode = '22023';
  end if;
  -- A retry (or a stale device) must not produce an occurrence already consumed.
  if p_index < rule.next_index then return false; end if;
  if rule.paused or p_index <> rule.next_index then
    raise exception 'recurring rule changed' using errcode = '22023';
  end if;
  occurrence_date := case rule.frequency
    when 'weekly' then rule.anchor_date_key + p_index * 7
    when 'monthly' then (rule.anchor_date_key + pg_catalog.make_interval(months => p_index))::date
    when 'yearly' then (rule.anchor_date_key + pg_catalog.make_interval(years => p_index))::date
  end;
  transaction_id := auth.uid()::text || '_rec-' || rule.id::text || '-' || occurrence_date::text;
  insert into public.transactions (id, user_id, type, amount_minor, currency, description, category, date_key)
  values (transaction_id, auth.uid(), rule.type, rule.amount_minor, rule.currency,
    rule.description, rule.category, occurrence_date)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  if not exists (select 1 from public.transactions where id = transaction_id and user_id = auth.uid()) then
    raise exception 'transaction unavailable' using errcode = '42501';
  end if;
  update public.recurring set next_index = p_index + 1 where id = rule.id;
  return inserted > 0;
end;
$$;

-- Patch only the supplied fields, so a device cannot erase unrelated settings.
create or replace function public.save_preferences_patch(p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  saved jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid preferences' using errcode = '22023';
  end if;
  insert into public.preferences (user_id, data) values (auth.uid(), p_patch)
  on conflict (user_id) do update set data = public.preferences.data || excluded.data
  returning data into saved;
  return saved;
end;
$$;

-- One SQL snapshot includes the full history and all planning data.
create or replace function public.read_account_backup() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'transactions', coalesce((select jsonb_agg(t order by t.date_key desc, t.id desc)
      from public.transactions t where t.user_id = auth.uid()), '[]'::jsonb),
    'recurring', coalesce((select jsonb_agg(r order by r.created_at, r.id)
      from public.recurring r where r.user_id = auth.uid()), '[]'::jsonb),
    'budgets', coalesce((select limits from public.budgets where user_id = auth.uid()), '{}'::jsonb),
    'preferences', (select data from public.preferences where user_id = auth.uid())
  ));
end;
$$;

create or replace function public.restore_account_backup(p_backup jsonb, p_restore_settings boolean default false)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  affected integer;
  transaction_count integer := 0;
  recurring_count integer := 0;
begin
  if not public.is_verified() or (p_backup->'account'->>'uid') is distinct from auth.uid()::text then
    raise exception 'backup belongs to another account' using errcode = '42501';
  end if;
  if (p_backup->>'schemaVersion') is distinct from '2'
    or jsonb_typeof(p_backup->'transactions') is distinct from 'array'
    or jsonb_typeof(p_backup->'recurring') is distinct from 'array' then
    raise exception 'invalid backup' using errcode = '22023';
  end if;
  if jsonb_array_length(p_backup->'transactions') > 100000
    or jsonb_array_length(p_backup->'recurring') > 10000 then
    raise exception 'backup too large' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_backup->'transactions') loop
    insert into public.transactions (id, user_id, type, amount_minor, currency, description, category, date_key)
    values (item->>'id', auth.uid(), item->>'type', (item->>'amountMinor')::bigint,
      item->>'currency', item->>'description', item->>'category', (item->>'dateKey')::date)
    on conflict (id) do nothing;
    get diagnostics affected = row_count;
    transaction_count := transaction_count + affected;
    if not exists (select 1 from public.transactions where id = item->>'id' and user_id = auth.uid()) then
      raise exception 'transaction unavailable' using errcode = '42501';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_backup->'recurring') loop
    insert into public.recurring (id, user_id, type, amount_minor, currency, description, category,
      frequency, anchor_date_key, next_index, mode, paused)
    values ((item->>'id')::uuid, auth.uid(), item->>'type', (item->>'amountMinor')::bigint,
      item->>'currency', item->>'description', item->>'category', item->>'frequency',
      (item->>'anchorDateKey')::date, (item->>'nextIndex')::integer, item->>'mode', (item->>'paused')::boolean)
    on conflict (id) do nothing;
    get diagnostics affected = row_count;
    recurring_count := recurring_count + affected;
    if not exists (select 1 from public.recurring where id = (item->>'id')::uuid and user_id = auth.uid()) then
      raise exception 'recurring rule unavailable' using errcode = '42501';
    end if;
  end loop;
  if p_restore_settings then
    if jsonb_typeof(p_backup->'budgets') is distinct from 'object'
      or jsonb_typeof(p_backup->'preferences') is distinct from 'object' then
      raise exception 'invalid backup settings' using errcode = '22023';
    end if;
    insert into public.budgets (user_id, limits) values (auth.uid(), p_backup->'budgets')
    on conflict (user_id) do update set limits = excluded.limits;
    insert into public.preferences (user_id, data) values (auth.uid(), p_backup->'preferences')
    on conflict (user_id) do update set data = excluded.data;
  end if;
  return jsonb_build_object('transactions', transaction_count, 'recurring', recurring_count);
end;
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt()->'amr';
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Supabase signs the password authentication time; refreshing a token does not reset it.
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(claims) = 'array' then claims else '[]'::jsonb end) method
    where method->>'method' = 'password'
      and case when method->>'timestamp' ~ '^[0-9]{1,12}$' then
        (method->>'timestamp')::bigint between extract(epoch from now() - interval '2 minutes') and extract(epoch from now())
      else false end
  ) then
    raise exception 'recent password authentication required' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.add_transaction_with_recurring(text, uuid, jsonb, text, text) from public, anon;
revoke execute on function public.register_recurring_occurrence(uuid, integer) from public, anon;
revoke execute on function public.save_preferences_patch(jsonb) from public, anon;
revoke execute on function public.read_account_backup() from public, anon;
revoke execute on function public.restore_account_backup(jsonb, boolean) from public, anon;
grant execute on function public.add_transaction_with_recurring(text, uuid, jsonb, text, text) to authenticated;
grant execute on function public.register_recurring_occurrence(uuid, integer) to authenticated;
grant execute on function public.save_preferences_patch(jsonb) to authenticated;
grant execute on function public.read_account_backup() to authenticated;
grant execute on function public.restore_account_backup(jsonb, boolean) to authenticated;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
