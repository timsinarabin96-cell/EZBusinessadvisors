-- Concord Deal Platform — Deal Room isolation (listing-style per-agent scoping)
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
--
-- Mirrors the listings isolation pattern:
--   listings: is_agency_member(agency_id) AND (agent_id = auth.uid() OR is_agency_admin(agency_id))
-- A Deal Room is visible only to the listing's OWNING AGENT or an agency admin
-- (owner/admin) — NOT to every agent in the agency. Buyers/sellers keep their
-- token-gated portal access (service role path is unaffected by RLS).
-- Idempotent — safe to run repeatedly.

-- ── Helper: can this caller access this deal room? ──────────────────────────
create or replace function public.is_deal_room_accessible(room_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1
    from public.data_rooms room
    left join public.listings listing on listing.id = room.listing_id
    where room.id = room_id
      and public.is_agency_member(room.agency_id)
      and (public.is_agency_admin(room.agency_id) or listing.agent_id = auth.uid())
  );
$$;

-- ── data_rooms ───────────────────────────────────────────────────────────────
drop policy if exists data_rooms_agency_access on public.data_rooms;
create policy data_rooms_agency_access on public.data_rooms
  to authenticated
  using (public.is_deal_room_accessible(id))
  with check (public.is_agency_member(agency_id));

-- ── data_room_folders ────────────────────────────────────────────────────────
drop policy if exists data_room_folders_agency_access on public.data_room_folders;
create policy data_room_folders_agency_access on public.data_room_folders
  to authenticated
  using (public.is_deal_room_accessible(data_room_id))
  with check (public.is_deal_room_accessible(data_room_id));

-- ── data_room_files ──────────────────────────────────────────────────────────
drop policy if exists data_room_files_agency_access on public.data_room_files;
create policy data_room_files_agency_access on public.data_room_files
  to authenticated
  using (public.is_deal_room_accessible(data_room_id))
  with check (public.is_deal_room_accessible(data_room_id));

-- ── data_room_activities ─────────────────────────────────────────────────────
drop policy if exists data_room_activities_agency_access on public.data_room_activities;
create policy data_room_activities_agency_access on public.data_room_activities
  to authenticated
  using (public.is_deal_room_accessible(data_room_id))
  with check (public.is_deal_room_accessible(data_room_id));

-- ── data_room_buyers ─────────────────────────────────────────────────────────
drop policy if exists data_room_buyers_agency_access on public.data_room_buyers;
create policy data_room_buyers_agency_access on public.data_room_buyers
  to authenticated
  using (public.is_deal_room_accessible(data_room_id))
  with check (public.is_deal_room_accessible(data_room_id));

-- ── data_room_shares ─────────────────────────────────────────────────────────
drop policy if exists data_room_shares_agency_access on public.data_room_shares;
create policy data_room_shares_agency_access on public.data_room_shares
  to authenticated
  using (public.is_deal_room_accessible(data_room_id))
  with check (public.is_deal_room_accessible(data_room_id));

-- ── data_room_comments (via file → room) ─────────────────────────────────────
drop policy if exists data_room_comments_agency_access on public.data_room_comments;
create policy data_room_comments_agency_access on public.data_room_comments
  to authenticated
  using (exists (
    select 1
    from public.data_room_files f
    where f.id = data_room_comments.file_id
      and public.is_deal_room_accessible(f.data_room_id)
  ))
  with check (exists (
    select 1
    from public.data_room_files f
    where f.id = data_room_comments.file_id
      and public.is_deal_room_accessible(f.data_room_id)
  ));

-- ── data_room_download_logs (via file → room) ────────────────────────────────
drop policy if exists data_room_download_logs_agency_access on public.data_room_download_logs;
create policy data_room_download_logs_agency_access on public.data_room_download_logs
  to authenticated
  using (exists (
    select 1
    from public.data_room_files f
    where f.id = data_room_download_logs.file_id
      and public.is_deal_room_accessible(f.data_room_id)
  ))
  with check (exists (
    select 1
    from public.data_room_files f
    where f.id = data_room_download_logs.file_id
      and public.is_deal_room_accessible(f.data_room_id)
  ));

-- ── data_room_qa (AI Q&A) — agency-scoped, broker/admin features only ────────
drop policy if exists data_room_qa_agency_access on public.data_room_qa;
create policy data_room_qa_agency_access on public.data_room_qa
  to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));
