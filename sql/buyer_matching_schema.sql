-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Buyer Match Engine — schema (additive, idempotent)
-- Records matches between buyer_search_profiles and listings, so buyers get
-- notified the moment a qualifying business goes live.
-- =============================================================================

begin;

create table if not exists public.buyer_match_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_search_profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  match_score integer not null default 0 check (match_score between 0 and 100),
  matched_on jsonb not null default '{}'::jsonb,
  status text not null default 'pending',          -- pending | notified | dismissed | expired
  notified_at timestamptz,
  notification_channel text,                       -- email | sms | both
  created_at timestamptz not null default now(),
  unique (buyer_profile_id, listing_id)
);

create index if not exists buyer_match_events_agency_idx
  on public.buyer_match_events (agency_id, status, created_at desc);
create index if not exists buyer_match_events_buyer_idx
  on public.buyer_match_events (buyer_profile_id, created_at desc);

alter table public.buyer_match_events enable row level security;

do $$
begin
  execute 'drop policy if exists buyer_match_events_agency_access on public.buyer_match_events';
  execute 'create policy buyer_match_events_agency_access on public.buyer_match_events for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.buyer_match_events from anon;
revoke truncate, references, trigger on public.buyer_match_events from authenticated;
grant select, insert, update, delete on public.buyer_match_events to authenticated;

commit;
