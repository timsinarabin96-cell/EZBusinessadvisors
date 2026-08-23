-- =============================================================================
-- Global Marketplace + Compliance Engine (additive, idempotent)
-- -----------------------------------------------------------------------------
-- 1) listings: country_code + currency_code (worldwide support)
-- 2) compliance_jurisdictions: per-country + per-US-state brokerage rules
--    (advisory matrix — always verify with counsel / the state commission)
-- 3) profiles: broker license fields (type, state, country, number, expiry)
-- 4) compliance_checklist: per-listing required disclosures
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Worldwide fields on listings
-- ---------------------------------------------------------------------------
alter table public.listings add column if not exists country_code text;      -- ISO 3166-1 alpha-2, e.g. 'US'
alter table public.listings add column if not exists currency_code text not null default 'USD'; -- ISO 4217
create index if not exists listings_country_idx on public.listings (country_code);

-- ---------------------------------------------------------------------------
-- 2. Broker license fields on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists license_type text;        -- 'real_estate' | 'business_broker' | 'none_required'
alter table public.profiles add column if not exists license_state text;       -- US state code (when applicable)
alter table public.profiles add column if not exists license_country text default 'US';
alter table public.profiles add column if not exists license_number text;
alter table public.profiles add column if not exists license_expiry date;
alter table public.profiles add column if not exists license_verified boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Compliance jurisdiction matrix (advisory)
--    rule:
--      're_license_when_real_estate' — real-estate license required ONLY when
--                                      the sale transfers real property (default)
--      're_license_always'           — license required for business brokerage
--                                      even without real estate (e.g. CA)
--      'no_license'                  — no specific brokerage license
--      'restricted'                  — additional local restrictions apply
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'US',
  state_code text,                        -- US states only; null = whole country
  rule text not null default 're_license_when_real_estate',
  note text,
  source text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country_code, state_code)
);

alter table public.compliance_jurisdictions enable row level security;
do $$
begin
  execute 'drop policy if exists compliance_jurisdictions_read on public.compliance_jurisdictions';
  execute 'create policy compliance_jurisdictions_read on public.compliance_jurisdictions for select to anon, authenticated using (true)';
end $$;
revoke all on public.compliance_jurisdictions from anon;
grant select on public.compliance_jurisdictions to anon, authenticated;

-- US default (most states): RE license required only when real estate is included.
insert into public.compliance_jurisdictions (country_code, state_code, rule, note, source, is_default)
values ('US', null, 're_license_when_real_estate',
  'Most states require an active real-estate license only when the sale transfers real property. Pure business-asset sales generally do not. Verify with your state commission.',
  'Advisory seed — verify locally', true)
on conflict (country_code, state_code) do nothing;

-- California: business-opportunity brokerage requires a real-estate broker license.
insert into public.compliance_jurisdictions (country_code, state_code, rule, note, source, is_default)
values ('US', 'CA', 're_license_always',
  'California requires a real-estate broker license to broker "business opportunities" — even when no real estate is transferred (Cal. Bus. & Prof. Code §10131).',
  'Advisory seed — verify with DRE', false)
on conflict (country_code, state_code) do nothing;

-- Key countries — advisory defaults (verify locally).
insert into public.compliance_jurisdictions (country_code, state_code, rule, note, source, is_default) values
  ('CA', null, 're_license_when_real_estate', 'Canada: provincial real-estate licensing applies when real property is included; business-asset brokerage generally unlicensed. Verify per province.', 'Advisory seed', false),
  ('GB', null, 'no_license', 'UK: no general business-broker license; some sectors carry FCA regulation. Verify with counsel.', 'Advisory seed', false),
  ('AU', null, 're_license_when_real_estate', 'Australia: state real-estate agent licensing applies when real property is included. Verify per state.', 'Advisory seed', false),
  ('IN', null, 'no_license', 'India: no central business-broker license; state real-estate (RERA) rules apply when real property is included.', 'Advisory seed', false),
  ('AE', null, 'restricted', 'UAE: real-estate brokerage requires emirate-level licensing (e.g., RERA/DED in Dubai) when real property is included.', 'Advisory seed', false),
  ('SG', null, 're_license_when_real_estate', 'Singapore: CEA registration required for real-estate agency work; business-asset sales generally unlicensed.', 'Advisory seed', false)
on conflict (country_code, state_code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Per-listing compliance checklist (required disclosures / approvals)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  check_key text not null,          -- e.g. 'license_required', 'real_estate_disclosure'
  label text not null,
  required boolean not null default true,
  satisfied boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (listing_id, check_key)
);

create index if not exists listing_compliance_listing_idx on public.listing_compliance_checks (listing_id);

alter table public.listing_compliance_checks enable row level security;
do $$
begin
  execute 'drop policy if exists listing_compliance_agency_access on public.listing_compliance_checks';
  execute 'create policy listing_compliance_agency_access on public.listing_compliance_checks for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;
revoke all on public.listing_compliance_checks from anon;
revoke truncate, references, trigger on public.listing_compliance_checks from authenticated;
grant select, insert, update, delete on public.listing_compliance_checks to authenticated;

commit;
