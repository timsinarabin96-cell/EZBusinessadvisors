-- =============================================================================
-- Concord Seller Valuation Engine — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Range estimates for listings built from an SDE-multiple table cross-checked
-- against revenue. The multiples and raw inputs are stored as jsonb so the
-- breakdown can be re-explained later. seller_lead_id is optional (a listing
-- may not be tied to a seller lead yet).
-- =============================================================================

begin;

create table if not exists public.valuation_estimates (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  listing_id     uuid references public.listings(id) on delete set null,
  seller_lead_id uuid references public.seller_leads(id) on delete set null,
  estimate_min   numeric(14, 2),
  estimate_max   numeric(14, 2),
  midpoint       numeric(14, 2),
  method         text,
  multiples      jsonb not null default '{}'::jsonb,
  inputs         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists valuation_estimates_agency_idx
  on public.valuation_estimates (agency_id, created_at desc);
create index if not exists valuation_estimates_listing_idx
  on public.valuation_estimates (listing_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.valuation_estimates enable row level security;

do $$
begin
  execute 'drop policy if exists valuation_estimates_agency_access on public.valuation_estimates';
  execute 'create policy valuation_estimates_agency_access on public.valuation_estimates for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.valuation_estimates from anon;
revoke truncate, references, trigger on public.valuation_estimates from authenticated;
grant select, insert, update, delete on public.valuation_estimates to authenticated;

commit;
