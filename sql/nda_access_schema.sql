-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord NDA-Gated Deal Access — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Buyers request confidential deal access, digitally sign an NDA (typed-name
-- consent + timestamp), and a broker approves/rejects. Approval grants them a
-- data-room buyer record so they can view the room.
-- =============================================================================

begin;

create table if not exists public.data_room_access_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  data_room_id uuid references public.data_rooms(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  requester_name text not null,
  requester_email text not null,
  requester_company text,
  rationale text,
  nda_signature text not null,               -- typed-name e-signature consent
  nda_signed_at timestamptz not null default now(),
  ip_address text,
  status text not null default 'pending',    -- pending | approved | rejected
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists nda_requests_agency_idx
  on public.data_room_access_requests (agency_id, status, created_at desc);
create index if not exists nda_requests_listing_idx
  on public.data_room_access_requests (listing_id, created_at desc);

alter table public.data_room_access_requests enable row level security;

do $$
begin
  execute 'drop policy if exists nda_requests_agency_access on public.data_room_access_requests';
  execute 'create policy nda_requests_agency_access on public.data_room_access_requests for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.data_room_access_requests from anon;
revoke truncate, references, trigger on public.data_room_access_requests from authenticated;
grant select, insert, update, delete on public.data_room_access_requests to authenticated;

commit;
