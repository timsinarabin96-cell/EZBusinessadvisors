-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Proof of Funds — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Public buyers submit proof-of-funds against a listing (email + optional
-- amount/document). Brokers review each submission and stamp verified/rejected.
-- Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.proof_of_funds (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  requester_email text not null,
  requester_name text,
  amount numeric(14,2),
  document_url text,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists proof_of_funds_agency_status_idx
  on public.proof_of_funds (agency_id, status, created_at desc);
create index if not exists proof_of_funds_listing_idx
  on public.proof_of_funds (listing_id);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped. Public submissions happen via the service-role client
-- in lib/proofOfFunds.ts, so anon needs no table access.
-- ---------------------------------------------------------------------------
alter table public.proof_of_funds enable row level security;

do $$
begin
  execute 'drop policy if exists proof_of_funds_agency_access on public.proof_of_funds';
  execute 'create policy proof_of_funds_agency_access on public.proof_of_funds for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.proof_of_funds from anon;
revoke truncate, references, trigger on public.proof_of_funds from authenticated;
grant select, insert, update, delete on public.proof_of_funds to authenticated;

commit;
