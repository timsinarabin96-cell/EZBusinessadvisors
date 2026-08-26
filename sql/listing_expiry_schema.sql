-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Listing Expiry & Renewal — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Tracks listing expiry dates and renewal/expiry status without depending on
-- the listings.status constraint (which may not allow 'expired').
-- =============================================================================

begin;

create table if not exists public.listing_expirations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','renewed','expired')),
  renewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists listing_expirations_agency_idx
  on public.listing_expirations (agency_id, status, expires_at);

alter table public.listing_expirations enable row level security;

do $$
begin
  execute 'drop policy if exists listing_expirations_agency_access on public.listing_expirations';
  execute 'create policy listing_expirations_agency_access on public.listing_expirations for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.listing_expirations from anon;
revoke truncate, references, trigger on public.listing_expirations from authenticated;
grant select, insert, update, delete on public.listing_expirations to authenticated;

commit;
