-- =============================================================================
-- Buyer accounts (#4) — additive, idempotent.
-- Buyers can now own their search profile: read/update their own
-- buyer_search_profiles row, see their own match events, and manage their
-- own watchlist searches + bookmarks. Agency policies stay untouched.
-- =============================================================================

begin;

-- 1) Buyer owns their search profile (profile_id = auth.uid()).
drop policy if exists buyer_search_profiles_owner_access on public.buyer_search_profiles;
create policy buyer_search_profiles_owner_access on public.buyer_search_profiles
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 2) Buyer can read their own match events (via their search profile).
drop policy if exists buyer_match_events_buyer_access on public.buyer_match_events;
create policy buyer_match_events_buyer_access on public.buyer_match_events
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_search_profiles p
      where p.id = buyer_profile_id and p.profile_id = auth.uid()
    )
  );

-- 3) Buyer can manage their own watchlist searches + bookmarks.
drop policy if exists watchlist_searches_buyer_access on public.buyer_watchlist_searches;
create policy watchlist_searches_buyer_access on public.buyer_watchlist_searches
  for all to authenticated
  using (
    exists (
      select 1 from public.buyer_search_profiles p
      where p.id = buyer_profile_id and p.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.buyer_search_profiles p
      where p.id = buyer_profile_id and p.profile_id = auth.uid()
    )
  );

drop policy if exists bookmarks_buyer_access on public.buyer_bookmarked_listings;
create policy bookmarks_buyer_access on public.buyer_bookmarked_listings
  for all to authenticated
  using (
    exists (
      select 1 from public.buyer_search_profiles p
      where p.id = buyer_profile_id and p.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.buyer_search_profiles p
      where p.id = buyer_profile_id and p.profile_id = auth.uid()
    )
  );

commit;
