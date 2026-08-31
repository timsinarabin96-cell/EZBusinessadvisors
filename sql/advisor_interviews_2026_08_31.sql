-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- advisor_interviews_2026_08_31.sql — Phase 1 AI Advisor Interview sessions.
-- -----------------------------------------------------------------------------
-- Conversational Claude intake (Agent / paid Seller paths) with deterministic
-- fallback. One row per listing; transcript in `qa`; the folded IntakeDraft
-- lands in `draft` once complete so Phase 3 merges it with extraction output.
-- Agency-scoped via the listing's agency (multi-tenant).
-- =============================================================================

begin;

create table if not exists public.advisor_interviews (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  status       text not null default 'in_progress',  -- in_progress | completed
  qa           jsonb not null default '[]'::jsonb,   -- [{questionId, topic, question, answer, answeredAt}]
  draft        jsonb,                                -- folded IntakeDraft when complete
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (listing_id)
);

create index if not exists advisor_interviews_listing_idx on public.advisor_interviews (listing_id);

alter table public.advisor_interviews enable row level security;

drop policy if exists "advisor interviews agency access" on public.advisor_interviews;
create policy "advisor interviews agency access" on public.advisor_interviews
  for all
  using (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = advisor_interviews.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = advisor_interviews.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

commit;
