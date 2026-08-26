-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Buyer Watchlists & Deal Alerts — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- 1) buyer_watchlist_searches  — saved searches a buyer can re-run + be alerted
--    on. Criteria is a jsonb copy of the buyer_search_profiles filter fields.
-- 2) buyer_bookmarked_listings — one-click bookmarks on listings.
-- Deal alerts flow through the existing buyer_match_events table so the
-- dashboard feed, email queue, and auto-match engine stay unified.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Saved searches
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_watchlist_searches (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_search_profiles(id) on delete cascade,
  name text not null default 'Saved search',
  criteria jsonb not null default '{}'::jsonb,   -- { industries, locations, min_price, max_price, min_revenue, min_sde, keywords }
  notify_email boolean not null default true,
  active boolean not null default true,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_searches_agency_idx
  on public.buyer_watchlist_searches (agency_id, active, created_at desc);
create index if not exists watchlist_searches_buyer_idx
  on public.buyer_watchlist_searches (buyer_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Bookmarks
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_bookmarked_listings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_search_profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_profile_id, listing_id)
);

create index if not exists bookmarks_buyer_idx
  on public.buyer_bookmarked_listings (buyer_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.buyer_watchlist_searches enable row level security;
alter table public.buyer_bookmarked_listings enable row level security;

do $$
begin
  execute 'drop policy if exists watchlist_searches_agency_access on public.buyer_watchlist_searches';
  execute 'create policy watchlist_searches_agency_access on public.buyer_watchlist_searches for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
  execute 'drop policy if exists bookmarks_agency_access on public.buyer_bookmarked_listings';
  execute 'create policy bookmarks_agency_access on public.buyer_bookmarked_listings for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.buyer_watchlist_searches from anon;
revoke all on public.buyer_bookmarked_listings from anon;
revoke truncate, references, trigger on public.buyer_watchlist_searches from authenticated;
revoke truncate, references, trigger on public.buyer_bookmarked_listings from authenticated;
grant select, insert, update, delete on public.buyer_watchlist_searches to authenticated;
grant select, insert, update, delete on public.buyer_bookmarked_listings to authenticated;

commit;
