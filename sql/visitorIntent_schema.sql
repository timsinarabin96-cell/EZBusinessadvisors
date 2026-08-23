-- =============================================================================
-- Visitor Intent Tracking — anonymous listing engagement
-- -----------------------------------------------------------------------------
-- Public visitors view listings without logging in. We track anonymized view
-- events (visitor_id is a browser-generated random UUID — never PII, never
-- tied to an email) so brokers can see which listings are getting real
-- traction: total views, unique visitors, repeat engagement, and recency.
-- This surfaces the "anonymous 90%" of buyers that watchlists never see.
-- =============================================================================

begin;

create table if not exists public.listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete cascade,  -- resolved server-side
  visitor_id uuid not null,                 -- browser-generated, anonymous
  referrer text,
  viewed_at timestamptz not null default now()
);

create index if not exists listing_views_listing_idx on public.listing_views (listing_id, viewed_at desc);
create index if not exists listing_views_agency_idx on public.listing_views (agency_id, viewed_at desc);
create index if not exists listing_views_visitor_idx on public.listing_views (visitor_id);

alter table public.listing_views enable row level security;

-- Public visitors can INSERT view events (anonymous) — no read.
do $$
begin
  execute 'drop policy if exists listing_views_public_insert on public.listing_views';
  execute 'create policy listing_views_public_insert on public.listing_views for insert to anon, authenticated with check (true)';
end $$;

-- Agency members can read view analytics for their listings.
do $$
begin
  execute 'drop policy if exists listing_views_agency_read on public.listing_views';
  execute 'create policy listing_views_agency_read on public.listing_views for select to authenticated using (public.is_agency_member(agency_id))';
end $$;

revoke all on public.listing_views from anon;
grant insert on public.listing_views to anon, authenticated;

commit;
