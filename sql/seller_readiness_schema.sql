-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Seller-Readiness Incubator — readiness per listing (additive,
-- idempotent)
-- -----------------------------------------------------------------------------
-- seller_readiness — a 0-100 readiness score for a listing about to go to
-- market: financial recast, CIM/BOV, data room, asking price, written seller
-- approval, and compliance review. One row per listing; unique listing_id so
-- recomputing upserts in place.
-- =============================================================================

begin;

create table if not exists public.seller_readiness (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  listing_id        uuid not null references public.listings(id) on delete cascade,
  readiness_score   integer not null default 0,
  components        jsonb not null default '{}'::jsonb,   -- { financials, cim, bov, dataRoom, price, approval, compliance }
  action_items      jsonb not null default '[]'::jsonb,
  valuation_estimate numeric(14,2),
  updated_at        timestamptz not null default now(),
  unique (listing_id)
);

create index if not exists seller_readiness_agency_idx
  on public.seller_readiness (agency_id, updated_at desc);
create index if not exists seller_readiness_score_idx
  on public.seller_readiness (readiness_score desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.seller_readiness enable row level security;

do $$
begin
  execute 'drop policy if exists seller_readiness_agency_access on public.seller_readiness';
  execute 'create policy seller_readiness_agency_access on public.seller_readiness for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.seller_readiness from anon;
revoke truncate, references, trigger on public.seller_readiness from authenticated;
grant select, insert, update, delete on public.seller_readiness to authenticated;

commit;
