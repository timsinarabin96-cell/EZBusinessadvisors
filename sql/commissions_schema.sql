-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Commission & Payout Tracking — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- One row per commission owed on a deal: which listing/deal it came from,
-- which agent earns it, the amount + agreed percentage, and lifecycle status
-- (pending -> approved -> paid) with a paid_at stamp.
-- Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.commission_records (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  agent_profile_id uuid references public.profiles(id) on delete set null,
  amount numeric(14,2),
  commission_pct numeric(5,2),
  status text not null default 'pending' check (status in ('pending','approved','paid')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists commission_records_agency_status_idx
  on public.commission_records (agency_id, status, created_at desc);

alter table public.commission_records enable row level security;

do $$
begin
  execute 'drop policy if exists commission_records_agency_access on public.commission_records';
  execute 'create policy commission_records_agency_access on public.commission_records for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.commission_records from anon;
revoke truncate, references, trigger on public.commission_records from authenticated;
grant select, insert, update, delete on public.commission_records to authenticated;

commit;
