-- =============================================================================
-- Concord Comps Database — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Sold-deal comparables: track closed transactions per agency to power
-- valuation multiples by industry.
-- =============================================================================

begin;

create table if not exists public.sold_comps (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  business_name text not null,
  industry text,
  location text,
  sale_price numeric(14,2),
  revenue numeric(14,2),
  sde numeric(14,2),
  multiple numeric(6,2),
  sold_at date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists sold_comps_agency_idx
  on public.sold_comps (agency_id, industry, sold_at desc);

alter table public.sold_comps enable row level security;

do $$
begin
  execute 'drop policy if exists sold_comps_agency_access on public.sold_comps';
  execute 'create policy sold_comps_agency_access on public.sold_comps for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.sold_comps from anon;
revoke truncate, references, trigger on public.sold_comps from authenticated;
grant select, insert, update, delete on public.sold_comps to authenticated;

commit;
