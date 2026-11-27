-- Pairing messages carry ephemeral public keys and an encrypted archive key.
create table if not exists public.vault_pairings (
  user_id uuid not null references public.vault_accounts(user_id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{16}$'),
  receiver_public text not null check (receiver_public ~ '^[A-Za-z0-9+/]{87}=$'),
  sender_public text check (sender_public ~ '^[A-Za-z0-9+/]{87}=$'),
  ciphertext text check (ciphertext ~ '^[A-Za-z0-9+/]{80}$'),
  expires_at timestamptz not null default now() + interval '10 minutes',
  primary key (user_id, id),
  check ((sender_public is null) = (ciphertext is null))
);

alter table public.vault_pairings enable row level security;
revoke all on public.vault_pairings from public, anon, authenticated;
grant select on public.vault_pairings to authenticated;
drop policy if exists own_vault_pairing on public.vault_pairings;
create policy own_vault_pairing on public.vault_pairings for select to authenticated
  using (user_id = (select auth.uid()) and expires_at > now() and (select public.is_verified()));

create or replace function public.start_vault_pairing(p_user uuid, p_id text, p_receiver text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  perform 1 from public.vault_accounts where user_id = p_user and active and keys->'v' = '2'::jsonb for update;
  if not found then return false; end if;
  delete from public.vault_pairings where user_id = p_user and expires_at <= now();
  if (select count(*) from public.vault_pairings where user_id = p_user) >= 5 then return false; end if;
  insert into public.vault_pairings (user_id, id, receiver_public) values (p_user, p_id, p_receiver)
    on conflict do nothing;
  return found;
end;
$$;

create or replace function public.approve_vault_pairing(p_user uuid, p_id text, p_receiver text, p_sender text, p_ciphertext text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  if p_sender is null or p_ciphertext is null then return false; end if;
  update public.vault_pairings set sender_public = p_sender, ciphertext = p_ciphertext
    where user_id = p_user and id = p_id and receiver_public = p_receiver and ciphertext is null and expires_at > now();
  return found;
end;
$$;

create or replace function public.remove_vault_pairing(p_user uuid, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  delete from public.vault_pairings where user_id = p_user and id = p_id;
end;
$$;

revoke execute on function public.start_vault_pairing(uuid, text, text),
  public.approve_vault_pairing(uuid, text, text, text, text), public.remove_vault_pairing(uuid, text) from public, anon;
grant execute on function public.start_vault_pairing(uuid, text, text),
  public.approve_vault_pairing(uuid, text, text, text, text), public.remove_vault_pairing(uuid, text) to authenticated;
