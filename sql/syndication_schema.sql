-- =============================================================================
-- Co-Brokerage Syndication Network
-- -----------------------------------------------------------------------------
-- Brokers offer their listings to other brokers/agencies as co-brokerage
-- opportunities with a defined commission split. Accepting makes the listing
-- jointly represented; the platform tracks splits automatically. This turns
-- the platform into a network (the "MLS of business sales") — the more brokers
-- participate, the more buyers and deals flow through it.
-- =============================================================================

begin;

create table if not exists public.syndication_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  from_agency_id uuid not null references public.agencies(id) on delete cascade,
  to_agency_id uuid not null references public.agencies(id) on delete cascade,
  to_profile_id uuid references public.profiles(id) on delete cascade,  -- optional: specific broker
  split_pct numeric(5,2) not null default 50.00,   -- receiving broker's share of commission
  status text not null default 'offered' check (status in ('offered','accepted','declined','withdrawn')),
  note text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists syndication_to_idx on public.syndication_offers (to_agency_id, status);
create index if not exists syndication_from_idx on public.syndication_offers (from_agency_id, status);
create index if not exists syndication_listing_idx on public.syndication_offers (listing_id);

alter table public.syndication_offers enable row level security;

-- Agency members can see and act on offers involving their agency.
do $$
begin
  execute 'drop policy if exists syndication_agency_access on public.syndication_offers';
  execute 'create policy syndication_agency_access on public.syndication_offers for all to authenticated using (public.is_agency_member(from_agency_id) or public.is_agency_member(to_agency_id)) with check (public.is_agency_member(from_agency_id) or public.is_agency_member(to_agency_id))';
end $$;

revoke all on public.syndication_offers from anon;
revoke truncate, references, trigger on public.syndication_offers from authenticated;
grant select, insert, update, delete on public.syndication_offers to authenticated;

commit;
