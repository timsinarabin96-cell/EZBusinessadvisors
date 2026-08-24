-- =============================================================================
-- Featured listing slots — fast cash for brokers.
-- -----------------------------------------------------------------------------
-- Brokers/sellers pay $149–499 for 30-day featured placement: the listing is
-- flagged is_featured (sorts to the top of the public feed + homepage
-- carousel) for a set window. Purchases are recorded idempotently and the
-- featured flag auto-expires.
-- =============================================================================

-- Featured flag + expiry on the listings table (additive).
alter table public.listings add column if not exists is_featured boolean not null default false;
alter table public.listings add column if not exists featured_until timestamptz;

-- Featured slot purchases.
create table if not exists public.featured_slots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  amount_cents integer not null,
  days integer not null default 30,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'refunded')),
  stripe_session text,
  created_at timestamptz not null default now()
);

alter table public.featured_slots enable row level security;

drop policy if exists "featured slots readable by agency members" on public.featured_slots;
create policy "featured slots readable by agency members" on public.featured_slots
  for select using (
    exists (select 1 from public.agency_members m
            where m.agency_id = featured_slots.agency_id
              and m.profile_id = auth.uid())
  );

drop policy if exists "featured slots writable by agency admins" on public.featured_slots;
create policy "featured slots writable by agency admins" on public.featured_slots
  for all using (
    exists (select 1 from public.agency_members m
            where m.agency_id = featured_slots.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  ) with check (
    exists (select 1 from public.agency_members m
            where m.agency_id = featured_slots.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  );

-- Helper: expire stale featured flags (called by cron or on read).
create or replace function public.expire_featured_slots() returns void
language sql security definer as $$
  update public.listings l
  set is_featured = false, featured_until = null
  where l.is_featured = true
    and l.featured_until is not null
    and l.featured_until < now();
$$;
