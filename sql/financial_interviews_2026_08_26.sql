-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- financial_interviews_2026_08_26.sql — AI Financial Accuracy Interview.
--
-- The seller portal's AI bot asks the seller targeted questions about their
-- uploaded financials (missing years, bank-vs-books variance, add-backs,
-- owner comp, one-time items, related-party transactions) and records the
-- transcript as verification evidence. Brokers can read the transcript
-- before approving an extraction.
--
--  1. financial_interviews — one row per listing: full Q&A transcript,
--     status (in_progress | completed), started/completed timestamps.
--  2. verified_financials.seller_confirmed_at — when the seller attested
--     their numbers via the interview (drives the 'seller-verified' trust
--     layer alongside bank-vs-books).
-- Idempotent.
-- =============================================================================

begin;

create table if not exists public.financial_interviews (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  status        text not null default 'in_progress',   -- in_progress | completed
  qa            jsonb not null default '[]'::jsonb,    -- [{ q, a, askedAt, answeredAt }]
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists financial_interviews_listing_idx on public.financial_interviews (listing_id);

alter table public.financial_interviews enable row level security;

drop policy if exists "interviews agency access" on public.financial_interviews;
create policy "interviews agency access" on public.financial_interviews
  for all
  using (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = financial_interviews.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = financial_interviews.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

-- Seller attestation timestamp on the verified record (interview completion).
alter table public.verified_financials add column if not exists seller_confirmed_at timestamptz;

commit;
