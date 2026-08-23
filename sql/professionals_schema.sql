-- =============================================================================
-- Professional Services Network — lawyers, CPAs, QoE agents, lenders, consultants
-- -----------------------------------------------------------------------------
-- A public directory of deal professionals (attorneys, accountants, quality-of-
-- earnings agents, SBA/lenders, consultants) that brokers add and vouch for.
-- Buyers and brokers can find the right expert for a deal; the platform earns
-- referral value and trust. Advisory only — verify credentials yourself.
-- =============================================================================

begin;

create table if not exists public.deal_professionals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,  -- broker who added/vouches
  professional_type text not null check (professional_type in
    ('lawyer', 'accountant', 'qoe_agent', 'lender', 'consultant')),
  name text not null,
  firm text,
  title text,
  specialty text,                    -- e.g. 'M&A', 'Tax', 'Franchise', 'SBA lending'
  industries text[] not null default '{}',   -- e.g. {'Restaurant','Laundromat'}
  states_served text[] not null default '{}', -- US state codes; empty = nationwide
  country_code text not null default 'US',
  license_number text,
  license_state text,
  license_verified boolean not null default false,
  years_experience int,
  deals_closed int,
  bio text,
  rates text,                        -- e.g. 'Hourly $250–$450 · Flat QoE $3.5k+'
  website text,
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  is_platform_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists deal_professionals_type_idx on public.deal_professionals (professional_type);
create index if not exists deal_professionals_active_idx on public.deal_professionals (is_active);
create index if not exists deal_professionals_country_idx on public.deal_professionals (country_code);

alter table public.deal_professionals enable row level security;

-- Public (anon + authenticated) can read active professionals.
do $$
begin
  execute 'drop policy if exists deal_professionals_public_read on public.deal_professionals';
  execute 'create policy deal_professionals_public_read on public.deal_professionals for select to anon, authenticated using (is_active = true)';
end $$;

-- Agency members can manage the professionals they added.
do $$
begin
  execute 'drop policy if exists deal_professionals_agency_write on public.deal_professionals';
  execute 'create policy deal_professionals_agency_write on public.deal_professionals for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.deal_professionals from anon;
grant select on public.deal_professionals to anon, authenticated;

commit;
