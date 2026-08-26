-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- white_label_multi_agency.sql — agency-scoped public feeds.
-- Extends the listing feed + sold feed with an optional agency filter so each
-- brokerage's own domain/subdomain shows ONLY its listings. Idempotent.
-- =============================================================================

begin;

-- 1) Public listing feed: add optional p_agency (slug OR domain OR custom_domain)
drop function if exists public.get_public_listing_feed(text, text);
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
  show_financials boolean
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
    pl.show_financials
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
    and (
      p_agency is null
      or l.agency_id = (
        select a.id from public.agencies a
        where a.slug = p_agency or a.domain = p_agency or a.custom_domain = p_agency
        limit 1
      )
    )
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text, text) from public;
grant execute on function public.get_public_listing_feed(text, text) to anon, authenticated;

-- 2) Sold listings: add optional p_agency (keeps live body: status='closed')
drop function if exists public.get_public_sold_listings(text);
create or replace function public.get_public_sold_listings(p_agency text default null)
returns table (
  listing_id uuid,
  industry text,
  sub_industry text,
  location_general text,
  asking_price numeric,
  sde numeric,
  multiple numeric,
  closed_at timestamptz,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.industry,
    l.sub_industry,
    l.location_general,
    l.asking_price,
    l.sde,
    case when l.sde is not null and l.sde > 0 then round(l.asking_price / l.sde, 2) else null end,
    l.updated_at,
    l.published_at
  from public.listings l
  where l.status = 'closed'
    and l.agency_id is not null
    and (
      p_agency is null
      or l.agency_id = (
        select a.id from public.agencies a
        where a.slug = p_agency or a.domain = p_agency or a.custom_domain = p_agency
        limit 1
      )
    )
  order by l.updated_at desc
  limit 50;
$$;

revoke all on function public.get_public_sold_listings(text) from public;
grant execute on function public.get_public_sold_listings(text) to anon, authenticated;

commit;
