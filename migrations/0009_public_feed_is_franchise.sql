-- =============================================================================
-- 0009_public_feed_is_franchise.sql
-- -----------------------------------------------------------------------------
-- Stage 1 (Franchise Opportunities): the public feed RPC never returned
-- is_franchise, so franchise listings rendered as ordinary businesses and the
-- franchise-only marketplace filter silently matched nothing. Rebuild
-- get_public_listing_feed with the same shape as image_system_fix_2026_08_28
-- (agent identity) PLUS l.is_franchise — additive, safe to re-run.
-- =============================================================================

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
  is_franchise boolean
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
    l.is_franchise
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
