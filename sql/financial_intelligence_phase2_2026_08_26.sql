-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- financial_intelligence_phase2_2026_08_26.sql — FIC Phase 2:
-- multi-year monthly ledger + extraction review state.
--
--  1. financial_ledger — normalized monthly P&L rows per fiscal year:
--     (listing_id, fiscal_year, month) → revenue / expenses / net.
--     Source: 'extraction' (AI-spread) | 'override' (broker-corrected) |
--             'manual'. The broker-approved ledger is what valuation, BOV,
--             CIM and recast consume — ONE source of truth.
--  2. financial_extractions.reviewed_by/reviewed_at already exist; this adds
--     review action tracking via the ledger's source column.
--  3. RPC helpers: upsert a ledger month, fetch the ledger for a listing,
--     and the operating-history band (reused from Phase 1).
-- Idempotent.
-- =============================================================================

begin;

create table if not exists public.financial_ledger (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  fiscal_year   int not null,
  month         int not null check (month between 1 and 12),
  revenue       numeric not null default 0,
  expenses      numeric not null default 0,
  net           numeric not null default 0,
  source        text not null default 'extraction',  -- extraction | override | manual
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (listing_id, fiscal_year, month)
);
create index if not exists financial_ledger_listing_idx on public.financial_ledger (listing_id, fiscal_year);

alter table public.financial_ledger enable row level security;

drop policy if exists "ledger agency access" on public.financial_ledger;
create policy "ledger agency access" on public.financial_ledger
  for all
  using (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = financial_ledger.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = financial_ledger.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

-- Upsert one ledger month (broker override path).
create or replace function public.upsert_ledger_month(
  p_listing_id uuid,
  p_fiscal_year int,
  p_month int,
  p_revenue numeric,
  p_expenses numeric,
  p_source text default 'manual'
)
returns public.financial_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  out_row public.financial_ledger;
begin
  insert into public.financial_ledger (listing_id, fiscal_year, month, revenue, expenses, net, source, reviewed_by, reviewed_at)
  values (
    p_listing_id, p_fiscal_year, p_month,
    p_revenue, p_expenses,
    p_revenue - p_expenses,
    p_source,
    auth.uid(),
    now()
  )
  on conflict (listing_id, fiscal_year, month)
  do update set
    revenue = excluded.revenue,
    expenses = excluded.expenses,
    net = excluded.revenue - excluded.expenses,
    source = excluded.source,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;

revoke all on function public.upsert_ledger_month(uuid, int, int, numeric, numeric, text) from public;
grant execute on function public.upsert_ledger_month(uuid, int, int, numeric, numeric, text) to authenticated;

-- Whole-year upsert (used by the auto-spread from extractions + broker edits).
create or replace function public.upsert_ledger_year(
  p_listing_id uuid,
  p_fiscal_year int,
  p_revenue numeric,
  p_expenses numeric,
  p_source text default 'extraction'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m int;
  done int := 0;
begin
  for m in 1..12 loop
    perform public.upsert_ledger_month(p_listing_id, p_fiscal_year, m, p_revenue / 12.0, p_expenses / 12.0, p_source);
    done := done + 1;
  end loop;
  return done;
end;
$$;

revoke all on function public.upsert_ledger_year(uuid, int, numeric, numeric, text) from public;
grant execute on function public.upsert_ledger_year(uuid, int, numeric, numeric, text) to authenticated;

-- Fetch the full ledger for a listing (newest year first, months ascending).
create or replace function public.get_financial_ledger(p_listing_id uuid)
returns table (
  fiscal_year int,
  month int,
  revenue numeric,
  expenses numeric,
  net numeric,
  source text,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select fl.fiscal_year, fl.month, fl.revenue, fl.expenses, fl.net, fl.source, fl.reviewed_at
  from public.financial_ledger fl
  where fl.listing_id = p_listing_id
  order by fl.fiscal_year desc, fl.month asc;
$$;

revoke all on function public.get_financial_ledger(uuid) from public;
grant execute on function public.get_financial_ledger(uuid) to authenticated;

commit;
