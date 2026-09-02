-- =============================================================================
-- 0010_real_estate_combined.sql
-- -----------------------------------------------------------------------------
-- Stage 2: Business + Real Estate combined listings.
-- 1) Referral-model fields on listings: the licensed real estate professional
--    (agent or attorney) attached to the real-property side of a combined
--    listing. Required BEFORE the RE closing milestone can be marked done in
--    the closing tracker (not required at publish). No automated license
--    lookup — buyers verify independently (boss-approved).
-- 2) Extend get_public_listing_feed with real-estate columns so the public
--    listing page can render the combined offering (business terms + property
--    details together, one page). Additive, safe to re-run.
-- =============================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS re_professional_name text,
  ADD COLUMN IF NOT EXISTS re_professional_contact text,
  ADD COLUMN IF NOT EXISTS re_professional_license text,
  ADD COLUMN IF NOT EXISTS re_professional_role text;

-- Rebuild the public feed RPC with real-estate fields (same shape as
-- migration 0009 + real_estate_included / property columns).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_listing_feed'
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

create or replace function public.get_public_listing_feed(p_slug text default null, p_agency text default null)
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
  agent_id uuid,
  agent_name text,
  agent_title text,
  agent_photo text,
  agent_phone text,
  agent_email text,
  is_franchise boolean,
  real_estate_included boolean,
  property_value numeric,
  real_estate_asking_price numeric,
  property_description text,
  square_footage numeric,
  land_acres numeric,
  year_built integer,
  property_city text,
  property_state text
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
    p.id,
    p.full_name,
    null::text,
    p.avatar_url,
    p.phone,
    p.email,
    l.is_franchise,
    l.real_estate_included,
    l.property_value,
    l.real_estate_asking_price,
    l.property_description,
    l.square_footage,
    l.land_acres,
    l.year_built,
    l.property_city,
    l.property_state
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  left join public.profiles p on p.id = l.agent_id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text, text) from public;
grant execute on function public.get_public_listing_feed(text, text) to anon, authenticated;
