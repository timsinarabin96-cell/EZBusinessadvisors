-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- roadmap_batch_2026_08_26.sql — marketplace depth (photos/phone/off-market).
--  1. listings.contact_phone      — optional public call-in line per listing
--  2. listings.off_market         — private-deal visibility tier (Sunbelt-style
--                                   $2M+ off-market room; excluded from public feed)
--  3. listing_call_clicks         — click-to-call tracking table (rate-limited
--                                   insert from anon; read by agency admins)
--  4. broker_profiles.is_featured — featured-broker carousel slot (admin set)
--  5. get_public_listing_feed     — excludes off_market listings; exposes
--                                   contact_phone for in-market ones
--  6. get_off_market_feed         — verified-buyer-only RPC (returns minimal
--                                   info; full details require NDA + broker)
-- Idempotent. Safe to run twice.
-- =============================================================================

begin;

-- 1) Listing contact phone (shown publicly for in-market listings)
alter table public.listings add column if not exists contact_phone text;

-- 2) Off-market visibility tier
alter table public.listings add column if not exists off_market boolean not null default false;

-- 3) Click-to-call tracking
create table if not exists public.listing_call_clicks (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references public.listings(id) on delete cascade,
  agency_id   uuid references public.agencies(id) on delete cascade,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
alter table public.listing_call_clicks enable row level security;
drop policy if exists "call clicks anon insert" on public.listing_call_clicks;
create policy "call clicks anon insert" on public.listing_call_clicks
  for insert to anon, authenticated with check (true);
drop policy if exists "call clicks agency read" on public.listing_call_clicks;
create policy "call clicks agency read" on public.listing_call_clicks
  for select to authenticated
  using (
    exists (
      select 1 from public.agency_members m
      where m.profile_id = auth.uid() and m.agency_id = listing_call_clicks.agency_id
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );
create index if not exists listing_call_clicks_listing_idx on public.listing_call_clicks (listing_id, created_at desc);

-- 4) Featured broker slot
alter table public.broker_profiles add column if not exists is_featured boolean not null default false;

-- 5) Public feed: exclude off-market, expose contact_phone
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
  show_financials boolean,
  contact_phone text
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
    l.contact_phone
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and coalesce(l.off_market, false) = false
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text, text) from public;
grant execute on function public.get_public_listing_feed(text, text) to anon, authenticated;

-- 6) Off-market feed (verified buyers only — minimal fields)
create or replace function public.get_off_market_feed(p_profile_id uuid)
returns table (
  listing_id uuid,
  slug text,
  public_title text,
  industry text,
  sub_industry text,
  location_general text,
  asking_price numeric,
  annual_revenue numeric,
  sde numeric,
  ebitda numeric,
  gallery_json jsonb,
  agency_name text,
  contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    coalesce(pl.slug, concat('offmarket-', l.id::text)),
    coalesce(nullif(pl.public_title, ''), nullif(l.headline, ''), concat(l.industry, ' Business Opportunity')),
    l.industry,
    l.sub_industry,
    l.location_general,
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.ebitda,
    pl.gallery_json,
    a.name,
    l.contact_phone
  from public.listings l
  left join public.public_listings pl on pl.listing_id = l.id
  left join public.agencies a on a.id = l.agency_id
  where coalesce(l.off_market, false) = true
    and l.status = 'active'
    and l.review_stage = 'approved'
    and (
      -- Verified buyer (paid pass or POF-verified profile)
      exists (
        select 1 from public.profiles p
        where p.id = p_profile_id and p.verified_buyer = true
      )
      or exists (
        select 1 from public.buyer_subscriptions bs
        where bs.profile_id = p_profile_id and bs.status = 'active'
      )
      or exists (
        select 1 from public.agency_members m
        where m.profile_id = p_profile_id
      )
    )
  order by l.updated_at desc;
$$;

revoke all on function public.get_off_market_feed(uuid) from public;
grant execute on function public.get_off_market_feed(uuid) to authenticated;

commit;
