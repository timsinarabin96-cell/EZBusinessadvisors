-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- Feature foundation: buyer pre-qualification, off-market listings, price watchers
alter table public.buyer_search_profiles
  add column if not exists pre_qualified boolean default false,
  add column if not exists pre_qualification_note text,
  add column if not exists funds_range text,
  add column if not exists pre_qualified_at timestamptz;

alter table public.listings
  add column if not exists is_off_market boolean default false;

alter table public.public_listings
  add column if not exists is_off_market boolean default false;

create table if not exists public.price_watchers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  email text not null,
  last_price numeric,
  created_at timestamptz not null default now(),
  unique (listing_id, email)
);
alter table public.price_watchers enable row level security;
drop policy if exists "price_watchers_select" on public.price_watchers;
create policy "price_watchers_select" on public.price_watchers for select using (true);
drop policy if exists "price_watchers_insert" on public.price_watchers;
create policy "price_watchers_insert" on public.price_watchers for insert with check (true);
drop policy if exists "price_watchers_delete" on public.price_watchers;
create policy "price_watchers_delete" on public.price_watchers for delete using (true);
