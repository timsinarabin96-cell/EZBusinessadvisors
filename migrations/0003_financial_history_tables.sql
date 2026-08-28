-- =============================================================================
-- 0003 — financial_history + recast_add_backs (referenced by lib/redFlag.ts and
-- lib/financing.ts but never created in the restored DB). Additive + safe:
-- empty tables; code already handles empty gracefully.
-- =============================================================================

create table if not exists public.financial_history (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  year          int,
  label         text,
  gross_revenue numeric,
  net_income    numeric,
  owner_comp    numeric,
  created_at    timestamptz not null default now()
);
create index if not exists financial_history_listing_idx on public.financial_history (listing_id);
alter table public.financial_history enable row level security;
do $$
begin
  execute 'drop policy if exists financial_history_agency_access on public.financial_history';
  execute 'create policy financial_history_agency_access on public.financial_history for all to authenticated using (public.is_agency_member((select agency_id from public.listings l where l.id = listing_id))) with check (public.is_agency_member((select agency_id from public.listings l where l.id = listing_id)))';
end $$;

create table if not exists public.recast_add_backs (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  category    text,
  description text,
  amount      numeric,
  recurring   boolean not null default false,
  year        int,
  created_at  timestamptz not null default now()
);
create index if not exists recast_add_backs_listing_idx on public.recast_add_backs (listing_id);
alter table public.recast_add_backs enable row level security;
do $$
begin
  execute 'drop policy if exists recast_add_backs_agency_access on public.recast_add_backs';
  execute 'create policy recast_add_backs_agency_access on public.recast_add_backs for all to authenticated using (public.is_agency_member((select agency_id from public.listings l where l.id = listing_id))) with check (public.is_agency_member((select agency_id from public.listings l where l.id = listing_id)))';
end $$;
