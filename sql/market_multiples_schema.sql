-- =============================================================================
-- Market Multiples — industry reference for "what do businesses usually sell for"
-- -----------------------------------------------------------------------------
-- Basis: SDE (seller's discretionary earnings) or EBITDA. Bands are typical
-- market ranges (BizBuySell / industry guide data, 2024-2026) used by the
-- valuation engine (computeValuation) and marketing docs (BOV/CIM).
-- Readable by any authenticated user; writes via service role only.
-- =============================================================================

create table if not exists public.market_multiples (
  id            uuid primary key default gen_random_uuid(),
  industry      text not null,
  aliases       text[] not null default '{}',
  basis         text not null default 'SDE' check (basis in ('SDE', 'EBITDA')),
  min_multiple  numeric(5,2) not null,
  max_multiple  numeric(5,2) not null,
  source_note   text,
  updated_at    timestamptz not null default now()
);

alter table public.market_multiples enable row level security;

-- Idempotency guard: unique per (industry, basis, band) so re-seeding never duplicates.
-- Must exist BEFORE the seed insert below (on conflict do nothing needs it).
create unique index if not exists market_multiples_band_key
  on public.market_multiples (industry, basis, min_multiple, max_multiple);

drop policy if exists market_multiples_read on public.market_multiples;
create policy market_multiples_read on public.market_multiples
  for select to authenticated using (true);

revoke all on public.market_multiples from anon;

-- Seed: typical small-business sale multiples by industry (2024-2026 guides).
insert into public.market_multiples (industry, aliases, basis, min_multiple, max_multiple, source_note) values
  ('Home care',            array['home health','homecare','care home','home care agency'], 'EBITDA', 4.0, 5.0, 'Home care franchises & agencies typically trade 4-5x EBITDA'),
  ('Home care',            array['home health','homecare','care home','home care agency'], 'SDE', 2.5, 3.5, 'SDE band for smaller home care operators'),
  ('Restaurants',          array['restaurant','food service','cafe','diner','bar','catering'], 'SDE', 1.8, 2.6, 'Independent restaurants trade ~2-3x SDE'),
  ('Auto repair',          array['auto','mechanic','car repair','service center'], 'SDE', 2.0, 3.0, 'Auto repair / service shops'),
  ('Cleaning',             array['janitorial','house cleaning','maid','commercial cleaning'], 'SDE', 2.0, 3.0, 'Cleaning & janitorial services'),
  ('Landscaping',          array['lawn','landscape','snow removal'], 'SDE', 2.0, 3.2, 'Landscaping & lawn care'),
  ('Construction',         array['contractor','trades','remodeling','roofing','hvac','plumbing','electrical'], 'SDE', 1.8, 2.8, 'Construction & trades'),
  ('Manufacturing',        array['factory','production','fabrication','machine shop'], 'SDE', 2.5, 3.5, 'Light manufacturing'),
  ('Manufacturing',        array['factory','production','fabrication','machine shop'], 'EBITDA', 4.0, 5.5, 'Manufacturers with clean books trade 4-5.5x EBITDA'),
  ('Distribution',         array['wholesale','supply','import'], 'SDE', 2.2, 3.2, 'Distribution & wholesale'),
  ('Distribution',         array['wholesale','supply','import'], 'EBITDA', 3.5, 4.5, 'Distribution with scale trades 3.5-4.5x EBITDA'),
  ('Retail',               array['store','shop','boutique'], 'SDE', 1.8, 2.8, 'Retail stores'),
  ('E-commerce',           array['online','dropshipping','amazon fba'], 'SDE', 2.0, 3.2, 'E-commerce businesses'),
  ('E-commerce',           array['online','dropshipping','amazon fba'], 'EBITDA', 3.5, 5.0, 'E-commerce with traction trades 3.5-5x EBITDA'),
  ('Software / SaaS',      array['software','saas','tech','it services','app'], 'SDE', 3.0, 4.5, 'Software & IT services'),
  ('Software / SaaS',      array['software','saas','tech','it services','app'], 'EBITDA', 4.0, 6.5, 'SaaS typically trades 4-6.5x EBITDA'),
  ('Healthcare',           array['medical','dental','clinic','doctor','chiropractic','physical therapy','pharmacy'], 'SDE', 3.0, 4.0, 'Medical, dental & clinic practices'),
  ('Healthcare',           array['medical','dental','clinic','doctor','chiropractic','physical therapy','pharmacy'], 'EBITDA', 4.5, 6.0, 'Healthcare practices trade 4.5-6x EBITDA'),
  ('Salon / Barbershop',   array['salon','barber','beauty','spa','nails'], 'SDE', 1.8, 2.8, 'Salons, barbershops & spas'),
  ('Laundromat',           array['laundry','coin laundry'], 'SDE', 2.5, 3.5, 'Laundromats'),
  ('Car wash',             array['carwash'], 'SDE', 2.5, 3.5, 'Car washes'),
  ('Self storage',         array['storage unit','mini storage'], 'EBITDA', 5.0, 6.5, 'Self storage trades 5-6.5x EBITDA'),
  ('Trucking / Logistics', array['trucking','freight','delivery','transportation','courier'], 'SDE', 2.0, 3.0, 'Trucking & logistics'),
  ('Trucking / Logistics', array['trucking','freight','delivery','transportation','courier'], 'EBITDA', 3.0, 4.0, 'Logistics with fleet trades 3-4x EBITDA'),
  ('Pet services',         array['pet','grooming','boarding','veterinary'], 'SDE', 2.4, 3.4, 'Pet care services'),
  ('Childcare',            array['daycare','child care','preschool','learning center'], 'SDE', 2.5, 3.5, 'Childcare centers'),
  ('Childcare',            array['daycare','child care','preschool','learning center'], 'EBITDA', 4.0, 5.0, 'Childcare with enrollment scale trades 4-5x EBITDA'),
  ('Gas station / C-Store', array['gas','convenience store','fuel','c-store'], 'SDE', 2.0, 3.0, 'Gas stations & convenience stores'),
  ('Gas station / C-Store', array['gas','convenience store','fuel','c-store'], 'EBITDA', 3.5, 4.5, 'Gas stations with fuel contracts trade 3.5-4.5x EBITDA'),
  ('Fitness / Gym',        array['gym','fitness','crossfit','yoga','pilates'], 'SDE', 2.0, 3.0, 'Gyms & fitness studios'),
  ('Hotels / Motels',      array['hotel','motel','inn','bed and breakfast','bnb'], 'EBITDA', 4.5, 6.5, 'Hotels & motels trade 4.5-6.5x EBITDA'),
  ('Hotels / Motels',      array['hotel','motel','inn','bed and breakfast','bnb'], 'SDE', 2.5, 3.5, 'SDE band for smaller hospitality assets'),
  ('Warehouse / Industrial', array['warehouse','industrial','storage facility','distribution center'], 'EBITDA', 4.0, 5.5, 'Warehouses & industrial real estate trade 4-5.5x EBITDA'),
  ('Vending',              array['vending machine','vending route','coin-op'], 'SDE', 2.5, 3.5, 'Vending routes trade 2.5-3.5x SDE'),
  ('Liquor store',         array['liquor','beer wine','package store','spirits'], 'SDE', 2.0, 3.0, 'Liquor & package stores'),
  ('Bakery',               array['bakery','baking','pastry','donut','doughnut'], 'SDE', 1.8, 2.6, 'Bakeries trade ~2-2.5x SDE'),
  ('Coffee shop',          array['coffee','cafe','espresso'], 'SDE', 2.0, 3.0, 'Coffee shops trade 2-3x SDE'),
  ('Printing',             array['print shop','printing','sign shop','copy'], 'SDE', 2.0, 3.0, 'Print & sign shops'),
  ('Funeral home',         array['funeral','crematory','mortuary'], 'SDE', 2.5, 3.5, 'Funeral homes trade 2.5-3.5x SDE'),
  ('Funeral home',         array['funeral','crematory','mortuary'], 'EBITDA', 4.0, 5.0, 'Funeral homes with scale trade 4-5x EBITDA'),
  ('Franchise',            array['franchise','franchisee','franchisor'], 'SDE', 2.5, 3.5, 'Franchise businesses trade 2.5-3.5x SDE'),
  ('Staffing',             array['staffing','recruiting','employment agency','temp agency'], 'EBITDA', 3.5, 5.0, 'Staffing firms trade 3.5-5x EBITDA'),
  ('Insurance agency',     array['insurance','agency','brokerage','independent agent'], 'EBITDA', 3.5, 5.5, 'Insurance agencies trade 3.5-5.5x EBITDA'),
  ('Insurance agency',     array['insurance','agency','brokerage','independent agent'], 'SDE', 2.5, 3.5, 'SDE band for smaller agencies'),
  ('Accounting / Bookkeeping', array['accounting','bookkeeping','cpa','tax prepar','payroll'], 'SDE', 2.0, 3.0, 'Accounting & bookkeeping practices'),
  ('Auto dealership',      array['dealership','car dealer','used cars','auto sales'], 'SDE', 2.0, 3.0, 'Auto dealerships (asset-heavy)'),
  ('Marina',               array['marina','boat slip','boatyard'], 'EBITDA', 5.0, 7.0, 'Marinas trade 5-7x EBITDA'),
  ('Golf course',          array['golf','country club','driving range'], 'EBITDA', 4.0, 6.0, 'Golf courses trade 4-6x EBITDA'),
  ('Real estate brokerage', array['real estate','realtor','property management','title'], 'SDE', 2.0, 3.0, 'Real estate & property management firms'),
  ('General small business', array['small business','side business','main street','mom and pop'], 'SDE', 2.5, 3.5, 'Fallback band — typical range for an established small business'),
  ('General small business', array['small business','side business','main street','mom and pop'], 'EBITDA', 3.5, 5.0, 'Fallback band — typical EBITDA range for an established small business')
on conflict do nothing;
