-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- financial_intelligence_2026_08_26.sql — Phase 1 of the Financial Intelligence
-- Core (FIC): the universal financial document reader.
--
--  1. financial_documents.fiscal_year     — which operating year this doc covers
--     (Year 1..5; adaptive: a 2-year-old business just has years 1-2)
--  2. financial_documents.operating_years — total years of operating history the
--     broker declared (drives year slots + valuation treatment)
--  3. financial_extractions               — per-document AI extraction results:
--     doc type, confidence, extracted JSON (revenue/expenses/SDE/EBITDA/balances/
--     ratios), model used, review state. Broker can review/approve/override.
--  4. RLS: agency members read/write their own docs + extractions; platform
--     admins read all. Idempotent.
-- =============================================================================

begin;

-- 1) Adaptive multi-year columns on the source document table
alter table public.financial_documents add column if not exists fiscal_year int;
alter table public.financial_documents add column if not exists operating_years int;
alter table public.financial_documents add column if not exists doc_type text;
create index if not exists financial_documents_year_idx on public.financial_documents (listing_id, fiscal_year);

-- 2) Per-document AI extraction results (the "universal reader" output)
create table if not exists public.financial_extractions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid references public.financial_documents(id) on delete cascade,
  listing_id      uuid references public.listings(id) on delete cascade,
  fiscal_year     int,
  doc_type        text not null default 'other',
  confidence      numeric not null default 0,
  extracted       jsonb not null default '{}'::jsonb,   -- { revenueTotal, expenseTotal, sde, ebitda, balances[], ratios[], trends[], lineItems[] }
  model           text,
  review_state    text not null default 'pending',      -- pending | approved | overridden
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  broker_override jsonb,                                -- broker-edited numbers (source of truth once set)
  created_at      timestamptz not null default now()
);
create index if not exists financial_extractions_doc_idx on public.financial_extractions (document_id);
create index if not exists financial_extractions_listing_idx on public.financial_extractions (listing_id, fiscal_year);

alter table public.financial_extractions enable row level security;

-- Agency members can read/write extractions for docs in their agency.
drop policy if exists "extractions agency access" on public.financial_extractions;
create policy "extractions agency access" on public.financial_extractions
  for all
  using (
    exists (
      select 1 from public.financial_documents fd
      join public.listings l on l.id = fd.listing_id
      join public.agency_members m on m.agency_id = l.agency_id
      where fd.id = financial_extractions.document_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.financial_documents fd
      join public.listings l on l.id = fd.listing_id
      join public.agency_members m on m.agency_id = l.agency_id
      where fd.id = financial_extractions.document_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

-- 3) Operating-years helper: valuation treatment depends on available history.
--    1-2 years → limited-history flag (conservative multiples)
--    3+ years  → established track record (standard multiples)
create or replace function public.financial_history_band(p_listing_id uuid)
returns table (
  declared_years int,
  available_years int,
  band text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(max(fd.operating_years), 0)::int as declared_years,
    count(distinct fd.fiscal_year)::int as available_years,
    case
      when count(distinct fd.fiscal_year) >= 3 then 'established'
      when count(distinct fd.fiscal_year) >= 1 then 'limited'
      else 'none'
    end as band
  from public.financial_documents fd
  where fd.listing_id = p_listing_id
    and fd.category <> 'generated_document';
$$;

revoke all on function public.financial_history_band(uuid) from public;
grant execute on function public.financial_history_band(uuid) to authenticated;

commit;
