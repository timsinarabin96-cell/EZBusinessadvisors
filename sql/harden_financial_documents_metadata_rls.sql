-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Harden financial_documents METADATA visibility (09-01 audit follow-up)
-- -----------------------------------------------------------------------------
-- Before: fd_select was `for select to authenticated using (true)` — ANY
-- authenticated user could read every financial_documents row (file names,
-- storage paths, listing/deal ids, recast/BOV/CIM data, financial summaries)
-- for listings they have no relationship with. Real information leakage.
--
-- After: row access requires ONE of —
--   1. the uploader themselves (uploaded_by = auth.uid()), or
--   2. an agency member of the agency that owns the linked listing/deal
--      (same is_agency_member() fence used everywhere else), or
--   3. an NDA-approved buyer for the listing, and ONLY for documents flagged
--      visible_to_buyer (the flag that marks docs shared into the data room).
--
-- UPDATE/DELETE were already `is_broker_or_admin() or uploaded_by = auth.uid()`
-- (a GLOBAL role check, not agency-scoped) — tightened here to the same
-- agency fence so cross-agency brokers can't touch another agency's rows.
-- INSERT: previously `with check (true)` (any authenticated user could insert
-- rows) — now scoped to uploader/agency member of the linked listing/deal.
--
-- NDA check uses a SECURITY DEFINER helper so the subquery on
-- data_room_access_requests (itself RLS-fenced to agency members) does not
-- get re-filtered by the calling user's RLS. Same pattern as is_agency_member.
-- =============================================================================

begin;

-- ── Helper: is the current user an NDA-approved buyer for this listing? ─────
create or replace function public.has_approved_nda_for_listing(p_listing_id uuid)
returns boolean
language sql stable security definer
set search_path to public
as $$
  select exists (
    select 1
    from public.data_room_access_requests r
    where r.listing_id = p_listing_id
      and r.status = 'approved'
      and lower(r.requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.has_approved_nda_for_listing(uuid) to authenticated;

-- ── Helper: agency that owns a financial_documents row (via listing OR deal) ─
create or replace function public.financial_document_agency_id(p_doc public.financial_documents)
returns uuid
language sql stable
set search_path to public
as $$
  select coalesce(
    (select l.agency_id from public.listings l where l.id = p_doc.listing_id),
    (select d.agency_id from public.deals d where d.id = p_doc.deal_id)
  );
$$;

-- ── Helper: can the current user manage (update/delete) this document? ──────
create or replace function public.can_manage_financial_document(p_doc public.financial_documents)
returns boolean
language sql stable security definer
set search_path to public
as $$
  select
    p_doc.uploaded_by = auth.uid()
    or public.is_agency_member(public.financial_document_agency_id(p_doc));
$$;

grant execute on function public.can_manage_financial_document(public.financial_documents) to authenticated;

-- ── Replace the leaky policies ──────────────────────────────────────────────
drop policy if exists "fd_select" on public.financial_documents;
drop policy if exists "fd_insert" on public.financial_documents;
drop policy if exists "fd_update" on public.financial_documents;
drop policy if exists "fd_delete" on public.financial_documents;

-- SELECT: uploader OR owning-agency member OR NDA-approved buyer (visible docs only)
create policy "fd_select" on public.financial_documents
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_agency_member(public.financial_document_agency_id(financial_documents))
    or (
      financial_documents.visible_to_buyer = true
      and financial_documents.listing_id is not null
      and public.has_approved_nda_for_listing(financial_documents.listing_id)
    )
  );

-- INSERT: uploader or owning-agency member only
create policy "fd_insert" on public.financial_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    or public.is_agency_member(public.financial_document_agency_id(financial_documents))
  );

-- UPDATE: owning-agency member or uploader (agency-scoped, not global broker role)
create policy "fd_update" on public.financial_documents
  for update to authenticated
  using (public.can_manage_financial_document(financial_documents))
  with check (public.can_manage_financial_document(financial_documents));

-- DELETE: owning-agency member or uploader
create policy "fd_delete" on public.financial_documents
  for delete to authenticated
  using (public.can_manage_financial_document(financial_documents));

commit;
