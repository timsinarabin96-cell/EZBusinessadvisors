-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- AI Match Pass — buyer subscription schema
-- -----------------------------------------------------------------------------
-- Buyers pay $49–99/mo for priority deal alerts, off-market listings, AI
-- fit-scoring, and a verified-buyer badge. This is a SEPARATE product from
-- the brokerage SaaS plans (subscriptions table) — buyers aren't agencies.
-- =============================================================================

create table if not exists public.buyer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null default 'match_pass' check (tier in ('match_pass', 'match_pass_elite')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  stripe_customer text,
  stripe_sub text,
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id)
);

alter table public.buyer_subscriptions enable row level security;

drop policy if exists "buyer sees own subscription" on public.buyer_subscriptions;
create policy "buyer sees own subscription" on public.buyer_subscriptions
  for select using (auth.uid() = profile_id);

drop policy if exists "buyer manages own subscription" on public.buyer_subscriptions;
create policy "buyer manages own subscription" on public.buyer_subscriptions
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Verified-buyer flag on profiles (drives the badge + priority alerts).
alter table public.profiles add column if not exists verified_buyer boolean not null default false;

-- Match-pass status view (JOIN helper for gating queries).
create or replace view public.buyer_match_pass as
select
  bs.profile_id,
  bs.tier,
  bs.status,
  bs.current_period_end,
  (bs.status in ('active', 'trialing')) as is_active
from public.buyer_subscriptions bs;
