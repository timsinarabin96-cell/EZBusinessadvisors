-- ============================================================================
-- Public feed v3: franchise listings carry their own buyer-facing economics
-- (brand, total investment range, franchise fee, royalty %, territories).
-- Boss decision 2026-09-03: "Franchise are different" — show franchise facts
-- on public cards, not asset-sale inventory/property chips.
-- ============================================================================

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
  contact_phone text,
  trust_label text,
  inventory_included boolean,
  ffe_included boolean,
  goodwill_included boolean,
  asset_sale boolean,
  real_estate_included boolean,
  property_value numeric,
  real_estate_asking_price numeric,
  inventory_value numeric,
  brand_name text,
  franchise_fee numeric,
  royalty_fee_pct numeric,
  territories_available text,
  existing_units integer,
  total_investment_min numeric,
  total_investment_max numeric,
  ideal_candidate_liquid_capital numeric,
  ideal_candidate_net_worth numeric,
  industry_category text
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
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.ebitda,
    pl.public_highlights,
    pl.gallery_json,
    pl.is_featured,
    pl.is_confidential,
    pl.published_at,
    pl.show_financials,
    l.contact_phone,
    case when l.seller_tier = 'paid' then 'AI-Verified Financials' else 'Self-Reported' end,
    l.inventory_included,
    l.ffe_included,
    l.goodwill_included,
    l.asset_sale,
    l.real_estate_included,
    l.property_value,
    l.real_estate_asking_price,
    l.inventory_value,
    fd.brand_name,
    fd.franchise_fee,
    fd.royalty_fee_pct,
    fd.territories_available,
    fd.existing_units,
    fd.total_investment_min,
    fd.total_investment_max,
    fd.ideal_candidate_liquid_capital,
    fd.ideal_candidate_net_worth,
    fd.industry_category
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  left join public.franchise_details fd on fd.listing_id = l.id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and coalesce(l.off_market, false) = false
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text) from public;
revoke all on function public.get_public_listing_feed(text, text) from public;
grant execute on function public.get_public_listing_feed(text, text) to anon, authenticated;

commit;
