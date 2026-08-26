-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- SPONSORED SLOTS (ads) — 2026-08-26
-- Run this in the Supabase SQL Editor.
--
-- Small, text-only "Sponsored" slots for business/finance advertisers.
-- Public read (active slots only) + admin write. No ad networks — direct
-- sponsorships from your professional network (lenders, CPAs, insurers).
-- =============================================================================

create table if not exists public.ad_slots (
  id              uuid primary key default gen_random_uuid(),
  slot_key        text not null unique,      -- placement id: marketplace_bottom, newspaper_top...
  advertiser      text not null,             -- "ABC Funding"
  body            text not null,             -- one-line pitch
  url             text not null,             -- destination
  badge           text not null default 'Sponsored', -- FTC-required label
  starts_at       date not null default current_date,
  ends_at         date,
  active          boolean not null default true,
  monthly_fee_cents integer not null default 0,  -- what the advertiser pays you
  impressions     integer not null default 0,
  clicks          integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Public read: only active, in-window slots. No PII, no fees exposed.
alter table public.ad_slots enable row level security;

drop policy if exists "ad_slots_public_read" on public.ad_slots;
create policy "ad_slots_public_read" on public.ad_slots
  for select using (
    active = true
    and (ends_at is null or ends_at >= current_date)
    and starts_at <= current_date
  );

-- Admin write (super_admin / admin only)
drop policy if exists "ad_slots_admin_write" on public.ad_slots;
create policy "ad_slots_admin_write" on public.ad_slots
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

-- Sample slot (disabled by default — flip active=true when you have your first advertiser)
insert into public.ad_slots (slot_key, advertiser, body, url, badge, active)
values ('marketplace_bottom', 'Your Ad Here', 'Promote your lending, CPA, or insurance services to business buyers and sellers.', 'https://example.com', 'Sponsored', false)
on conflict (slot_key) do nothing;
