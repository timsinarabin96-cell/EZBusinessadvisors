-- =============================================================================
-- Plaid-Verified Financials — the trust moat
-- -----------------------------------------------------------------------------
-- Sellers connect their business bank account via Plaid Link. The platform
-- verifies actual revenue flowing through the account and mints a
-- "Verified Revenue ✅" badge on the public listing. This kills the #1
-- objection in business sales (fake financials) and creates a data moat —
-- nobody else has verified deal financials.
--
-- SECURITY: access tokens live ONLY in verified_financials (server-side,
-- agency-scoped RLS). The public feed exposes just a boolean flag.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Verified financials store (server-side only)
-- ---------------------------------------------------------------------------
create table if not exists public.verified_financials (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  plaid_item_id text,               -- Plaid item id (server-side)
  plaid_access_token text,          -- NEVER exposed to clients/public
  institution_name text,
  account_mask text,
  account_name text,
  status text not null default 'pending' check (status in ('pending','connected','verified','failed')),
  verified_revenue numeric,         -- e.g. trailing 12-month revenue from bank data
  verified_period text,             -- e.g. 'last_12_months'
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id)
);

create index if not exists verified_financials_agency_idx on public.verified_financials (agency_id, status);

alter table public.verified_financials enable row level security;

-- Agency members manage their listings' verified financials.
do $$
begin
  execute 'drop policy if exists verified_financials_agency_access on public.verified_financials';
  execute 'create policy verified_financials_agency_access on public.verified_financials for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.verified_financials from anon;
revoke truncate, references, trigger on public.verified_financials from authenticated;
grant select, insert, update, delete on public.verified_financials to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Public badge flag on the public-facing listing table
-- ---------------------------------------------------------------------------
alter table public.public_listings add column if not exists revenue_verified boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Expose the boolean through the allowlisted public feed function
--    (financial values still gated by show_financials; the badge is public).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_listing_feed(p_slug text default null)
returns table (
  listing_id uuid,
  slug text,
  public_title text,
  public_summary text,
  industry text,
  sub_industry text,
  location_general text,
  asking_price numeric,
  annual_revenue numeric,
  sde numeric,
  ebitda numeric,
  public_highlights jsonb,
  gallery_json jsonb,
  is_featured boolean,
  is_confidential boolean,
  published_at timestamptz,
  show_financials boolean,
  revenue_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    pl.slug,
    coalesce(nullif(pl.public_title, ''), nullif(l.headline, ''), concat(l.industry, ' Business Opportunity')),
    pl.public_summary,
    l.industry,
    l.sub_industry,
    case when pl.location_exposure = 'general' then l.location_general else null end,
    case when pl.show_financials then l.asking_price else null end,
    case when pl.show_financials then l.annual_revenue else null end,
    case when pl.show_financials then l.sde else null end,
    case when pl.show_financials then l.ebitda else null end,
    pl.public_highlights,
    pl.gallery_json,
    pl.is_featured,
    pl.is_confidential,
    pl.published_at,
    pl.show_financials,
    pl.revenue_verified
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text) from public;
grant execute on function public.get_public_listing_feed(text) to anon, authenticated;

commit;
