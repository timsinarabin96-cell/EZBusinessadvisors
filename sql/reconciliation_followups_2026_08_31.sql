-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- reconciliation_followups_2026_08_31.sql — #7 reconciliation follow-up loop.
-- -----------------------------------------------------------------------------
-- One row per open/answered follow-up question the reconciliation gate asked
-- the broker (spec Phase 3: "never silently estimate to force a balance").
-- The loop re-runs the engine with the broker's answer folded in until clean
-- or flagged for review. Agency-scoped via the listing (multi-tenant).
-- =============================================================================

begin;

create table if not exists public.reconciliation_followups (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  status        text not null default 'open',      -- open | answered | flagged
  issue_kind    text not null default 'consistency', -- consistency | missing_category
  issue         jsonb not null default '{}'::jsonb,  -- the ReconciliationIssue
  question      text not null,
  suggested_answers jsonb not null default '[]'::jsonb,
  answer        text,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,
  updated_at    timestamptz not null default now()
);

create index if not exists reconciliation_followups_listing_idx
  on public.reconciliation_followups (listing_id, status, created_at desc);

alter table public.reconciliation_followups enable row level security;

drop policy if exists "reconciliation followups agency access" on public.reconciliation_followups;
create policy "reconciliation followups agency access" on public.reconciliation_followups
  for all
  using (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = reconciliation_followups.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = reconciliation_followups.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

commit;
