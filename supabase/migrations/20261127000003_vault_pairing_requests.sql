alter table public.vault_pairings add column if not exists rejected_at timestamptz;

create or replace function public.approve_vault_pairing(p_user uuid, p_id text, p_receiver text, p_sender text, p_ciphertext text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  if p_sender is null or p_ciphertext is null then return false; end if;
  update public.vault_pairings set sender_public = p_sender, ciphertext = p_ciphertext
    where user_id = p_user and id = p_id and receiver_public = p_receiver
      and ciphertext is null and rejected_at is null and expires_at > now();
  return found;
end;
$$;

create or replace function public.reject_vault_pairing(p_user uuid, p_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  update public.vault_pairings set rejected_at = now()
    where user_id = p_user and id = p_id and ciphertext is null and rejected_at is null and expires_at > now();
  return found;
end;
$$;

revoke execute on function public.reject_vault_pairing(uuid, text) from public, anon;
grant execute on function public.reject_vault_pairing(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'vault_pairings') then
    alter publication supabase_realtime add table public.vault_pairings;
  end if;
end;
$$;
