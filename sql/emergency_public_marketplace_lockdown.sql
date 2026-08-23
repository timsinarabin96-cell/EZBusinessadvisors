-- =============================================================================
-- Concord Deal Exchange — emergency public marketplace confidentiality patch
-- Protects private CRM tables and introduces an approval-gated public feed.
-- No records are deleted.
-- =============================================================================

begin;

-- Stop publishing the known test listing without deleting its CRM record.
update public.public_listings
set published = false,
    is_confidential = true
where listing_id = '8a0167a7-8336-4797-bfa2-c6ada1aeafe9';

update public.listings
set status = 'draft',
    review_stage = 'draft',
    updated_at = now()
where id = '8a0167a7-8336-4797-bfa2-c6ada1aeafe9';

-- Private CRM tables must never be directly readable or mutable by anonymous users.
revoke all on public.listings, public.public_listings from anon;
revoke all on public.buyer_leads, public.seller_leads from anon;

-- Public forms remain insert-only and can populate only intake-safe columns.
grant insert (
  listing_id, full_name, contact_name, email, phone, company,
  budget_range, industries_interest, industry_interest,
  desired_business_type, funds_available, financing_method,
  preferred_location, zip, timeframe, message, status
) on public.buyer_leads to anon;

grant insert (
  full_name, contact_name, email, phone, business_name, industry,
  revenue_range, timeframe, message, status, location_general
) on public.seller_leads to anon;

-- Authenticated application users retain normal CRUD, never table-owner powers.
revoke truncate, references, trigger on
  public.listings, public.public_listings, public.buyer_leads, public.seller_leads
from authenticated;

grant select, insert, update, delete on
  public.listings, public.public_listings, public.buyer_leads, public.seller_leads
to authenticated;

-- Remove the direct anonymous read policy so a future accidental grant cannot
-- silently reopen every active listing column.
drop policy if exists "listings: public reads active" on public.listings;

drop policy if exists listings_authenticated_read on public.listings;
create policy listings_authenticated_read on public.listings
  for select to authenticated using (true);

drop policy if exists "public listings read" on public.public_listings;

-- Explicit seller approval and public-only content fields.
alter table public.public_listings add column if not exists public_summary text;
alter table public.public_listings add column if not exists public_highlights jsonb not null default '[]'::jsonb;
alter table public.public_listings add column if not exists seller_approved_at timestamptz;
alter table public.public_listings add column if not exists seller_approval_reference text;
alter table public.public_listings add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.public_listings add column if not exists approval_expires_at timestamptz;

-- Public consumers call this allowlisted function instead of selecting from
-- listings. Financial values are null unless the seller approved disclosure.
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
  order by pl.is_featured desc, pl.published_at desc;
$$;

revoke all on function public.get_public_listing_feed(text) from public;
grant execute on function public.get_public_listing_feed(text) to anon, authenticated;

commit;
