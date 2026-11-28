-- Accounts choose their currency (preferences.data.currency, validated by the
-- app). Rows accept any ISO 4217 code instead of euro only. Amounts are still
-- hundredths of the major unit, so currencies with a small unit (yen, dong,
-- rupiah) need a higher ceiling: 1 trillion units, still a safe integer in JS.

alter table public.transactions drop constraint if exists transactions_currency_check;
alter table public.transactions add constraint transactions_currency_check
  check (currency ~ '^[A-Z]{3}$');
alter table public.transactions drop constraint if exists transactions_amount_minor_check;
alter table public.transactions add constraint transactions_amount_minor_check
  check (amount_minor > 0 and amount_minor <= 100000000000000);

alter table public.recurring drop constraint if exists recurring_currency_check;
alter table public.recurring add constraint recurring_currency_check
  check (currency ~ '^[A-Z]{3}$');
alter table public.recurring drop constraint if exists recurring_amount_minor_check;
alter table public.recurring add constraint recurring_amount_minor_check
  check (amount_minor > 0 and amount_minor <= 100000000000000);
