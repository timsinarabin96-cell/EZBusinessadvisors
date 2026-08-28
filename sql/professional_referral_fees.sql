-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Professional Referral-Fee Model — the boss's rule:
--   * Lenders pay the platform a referral fee on each deal they finance
--     (typical industry norm). Attorneys generally do NOT pay referral fees.
--   * A professional is only ADVERTISED in the public directory when they
--     have agreed to pay referral fees ("no fee agreement → not advertised").
--   * Referral fees are tracked per deal (due → paid), invoiced to the
--     professional, and recorded as platform revenue.
-- Idempotent. Run in Supabase SQL Editor.
-- =============================================================================

begin;

-- 1) deal_professionals gains the fee/advertising contract.
alter table public.deal_professionals add column if not exists pays_referral_fees boolean not null default false;
alter table public.deal_professionals add column if not exists referral_fee_pct numeric(5,2);            -- e.g. 1.00 = 1% of deal/loan amount
alter table public.deal_professionals add column if not exists referral_fee_terms text;                  -- e.g. "1% of funded loan, paid at close"
alter table public.deal_professionals add column if not exists advertised boolean not null default false; -- public directory visibility
alter table public.deal_professionals add column if not exists fee_agreement_at timestamptz;             -- when they agreed

-- Sanity: advertised requires the fee agreement.
create or replace function public.check_professional_advertised()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.advertised and not coalesce(new.pays_referral_fees, false) then
    raise exception 'Cannot advertise a professional who does not pay referral fees';
  end if;
  return new;
end;
$$;

drop trigger if exists deal_professionals_advertised_check on public.deal_professionals;
create trigger deal_professionals_advertised_check
  before insert or update on public.deal_professionals
  for each row execute function public.check_professional_advertised();

revoke all on function public.check_professional_advertised() from public, anon, authenticated;

-- 2) Per-deal referral fee ledger — what the platform is owed, per professional.
create table if not exists public.professional_referral_fees (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,   -- the brokerage whose deal it is
  professional_id uuid not null references public.deal_professionals(id) on delete cascade,
  deal_id        uuid references public.deals(id) on delete set null,
  listing_id     uuid references public.listings(id) on delete set null,
  basis_amount   numeric(14,2),                -- deal value / loan amount the fee is computed on
  fee_pct        numeric(5,2) not null,
  amount         numeric(14,2) not null,       -- computed fee due to the platform
  status         text not null default 'due' check (status in ('due','invoiced','paid','waived')),
  invoice_ref    text,                         -- invoice / payment reference
  paid_at        timestamptz,
  paid_method    text check (paid_method in ('stripe','ach','check','cash','other')),
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (professional_id, deal_id)
);

create index if not exists professional_referral_fees_agency_idx on public.professional_referral_fees (agency_id, status);
create index if not exists professional_referral_fees_pro_idx on public.professional_referral_fees (professional_id);

alter table public.professional_referral_fees enable row level security;

-- Agency members read; agency owner/admin write (same shape as other ledgers).
do $$
begin
  execute 'drop policy if exists professional_referral_fees_read on public.professional_referral_fees';
  execute 'create policy professional_referral_fees_read on public.professional_referral_fees for select to authenticated using (public.is_agency_member(agency_id))';
  execute 'drop policy if exists professional_referral_fees_write on public.professional_referral_fees';
  execute 'create policy professional_referral_fees_write on public.professional_referral_fees for insert to authenticated with check (public.is_agency_member(agency_id))';
  execute 'drop policy if exists professional_referral_fees_update on public.professional_referral_fees';
  execute 'create policy professional_referral_fees_update on public.professional_referral_fees for update to authenticated using (public.is_agency_member(agency_id))';
end $$;

revoke all on public.professional_referral_fees from anon;
revoke truncate, references, trigger on public.professional_referral_fees from authenticated;
grant select, insert, update, delete on public.professional_referral_fees to authenticated;

-- 3) Public directory: ONLY advertised professionals are visible.
drop policy if exists deal_professionals_public_read on public.deal_professionals;
create policy deal_professionals_public_read on public.deal_professionals
  for select using (is_active = true and advertised = true);

commit;
