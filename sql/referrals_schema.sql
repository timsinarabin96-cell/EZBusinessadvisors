-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Referral Program — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Brokers log buyer/seller referrals, track them through the funnel
-- (new -> contacted -> converted -> paid), and record the commission rate
-- agreed for a converted referral.
-- Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  referrer_name text not null,
  referrer_email text not null,
  referral_type text not null default 'buyer' check (referral_type in ('buyer','seller')),
  referee_name text,
  referee_email text,
  status text not null default 'new' check (status in ('new','contacted','converted','paid')),
  commission_pct numeric(5,2),
  notes text,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists referrals_agency_status_idx
  on public.referrals (agency_id, status, created_at desc);

alter table public.referrals enable row level security;

do $$
begin
  execute 'drop policy if exists referrals_agency_access on public.referrals';
  execute 'create policy referrals_agency_access on public.referrals for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.referrals from anon;
revoke truncate, references, trigger on public.referrals from authenticated;
grant select, insert, update, delete on public.referrals to authenticated;

commit;
