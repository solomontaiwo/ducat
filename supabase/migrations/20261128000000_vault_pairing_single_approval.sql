alter table public.vault_accounts add column if not exists pairing_key_check text
  check (pairing_key_check ~ '^[0-9a-f]{64}$');

alter table public.vault_pairings
  add column if not exists request_session text,
  add column if not exists automatic_approval boolean not null default false;

create or replace function public.start_vault_pairing_automatic(p_user uuid, p_id text, p_receiver text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  request_session_id text := nullif(auth.jwt()->>'session_id', '');
begin
  if request_session_id is null then return false; end if;
  if not public.start_vault_pairing(p_user, p_id, p_receiver) then return false; end if;
  update public.vault_pairings set request_session = request_session_id
    where user_id = p_user and id = p_id;
  return found;
end;
$$;

create or replace function public.approve_vault_pairing_automatic(
  p_user uuid, p_id text, p_receiver text, p_sender text, p_ciphertext text, p_key_check text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  approval_session_id text := nullif(auth.jwt()->>'session_id', '');
  registered_check text;
begin
  if p_user is distinct from auth.uid() or not public.is_verified() then
    raise exception 'verified account required' using errcode = '42501';
  end if;
  if approval_session_id is null or p_key_check is null or p_key_check !~ '^[0-9a-f]{64}$'
     or p_sender is null or p_ciphertext is null then return false; end if;

  select pairing_key_check into registered_check from public.vault_accounts
    where user_id = p_user and active and keys->'v' = '2'::jsonb for update;
  if not found or (registered_check is not null and registered_check <> p_key_check) then return false; end if;

  update public.vault_pairings set sender_public = p_sender, ciphertext = p_ciphertext, automatic_approval = true
    where user_id = p_user and id = p_id and receiver_public = p_receiver
      and request_session <> approval_session_id and ciphertext is null and rejected_at is null and expires_at > now();
  if not found then return false; end if;

  if registered_check is null then
    update public.vault_accounts set pairing_key_check = p_key_check where user_id = p_user;
  end if;
  return true;
end;
$$;

revoke execute on function public.start_vault_pairing_automatic(uuid, text, text),
  public.approve_vault_pairing_automatic(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.start_vault_pairing_automatic(uuid, text, text),
  public.approve_vault_pairing_automatic(uuid, text, text, text, text, text) to authenticated;
