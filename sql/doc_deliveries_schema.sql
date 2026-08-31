-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Document deliveries — approval-gated send path for client-facing reports
-- (CIM / BOV / recast). A delivery starts as `pending_approval`; the broker
-- single-taps Approve (triggers the real send: email + Deal Room + share link)
-- or Reject. Nothing goes out under the broker's license without that tap.
-- Additive — safe to run repeatedly.
-- =============================================================================

create table if not exists public.doc_deliveries (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  listing_id         uuid references public.listings(id) on delete cascade,
  deal_id            uuid,
  doc_kind           text not null check (doc_kind in ('cim', 'bov', 'recast', 'bli')),
  doc_title          text,
  version_id         uuid,                -- cim_versions / bov_versions / recast_projects id
  generated_doc_id   uuid,                -- generated_documents row holding the PDF
  storage_path       text,                -- documents bucket object path of the PDF
  recipient_name     text,
  recipient_email    text not null,
  recipient_role     text not null default 'buyer' check (recipient_role in ('buyer', 'seller', 'other')),
  status             text not null default 'pending_approval'
                     check (status in ('pending_approval', 'approved', 'rejected', 'sent', 'failed')),
  requested_by       uuid,
  approved_by        uuid,
  approved_at        timestamptz,
  sent_at            timestamptz,
  reject_reason      text,
  share_token        text unique,
  share_url          text,
  email_status       text,                -- ok | queued | failed | skipped
  deal_room_file_id  uuid,                -- data_room_files row created on send
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists doc_deliveries_agency_idx   on public.doc_deliveries (agency_id);
create index if not exists doc_deliveries_status_idx   on public.doc_deliveries (status);
create index if not exists doc_deliveries_listing_idx  on public.doc_deliveries (listing_id);
create index if not exists doc_deliveries_share_idx    on public.doc_deliveries (share_token);

-- RLS: agency members may read/update their own agency's deliveries; the
-- service-role server client bypasses RLS for the actual send mutations.
alter table public.doc_deliveries enable row level security;

drop policy if exists doc_deliveries_agency_select on public.doc_deliveries;
create policy doc_deliveries_agency_select on public.doc_deliveries
  for select to authenticated
  using (public.is_agency_member(agency_id));

drop policy if exists doc_deliveries_agency_update on public.doc_deliveries;
create policy doc_deliveries_agency_update on public.doc_deliveries
  for update to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

drop policy if exists doc_deliveries_agency_insert on public.doc_deliveries;
create policy doc_deliveries_agency_insert on public.doc_deliveries
  for insert to authenticated
  with check (public.is_agency_member(agency_id));

-- No anon access — a delivery is confidential client work product.
revoke all on public.doc_deliveries from anon;
revoke all on public.doc_deliveries from authenticated;
grant select, insert, update on public.doc_deliveries to authenticated;
