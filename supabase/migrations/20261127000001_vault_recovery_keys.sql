-- Version 2 wraps the archive key only with the random recovery code.
-- The six-digit PIN and its device-specific wrapping key stay on the device.
alter table public.vault_accounts drop constraint if exists vault_accounts_keys_check;
alter table public.vault_accounts add constraint vault_accounts_keys_check check (coalesce(
  jsonb_typeof(keys) = 'object' and octet_length(keys::text) < 4096
  and keys->>'recovery' ~ '^[A-Za-z0-9+/]{80}$'
  and (
    (
      keys->'v' = '1'::jsonb
      and keys - array['v', 'salt', 'password', 'recovery'] = '{}'::jsonb
      and keys->>'salt' ~ '^[A-Za-z0-9+/]{22}==$'
      and keys->>'password' ~ '^[A-Za-z0-9+/]{80}$'
    ) or (
      keys->'v' = '2'::jsonb
      and keys - array['v', 'recovery'] = '{}'::jsonb
    )
  ), false
));
