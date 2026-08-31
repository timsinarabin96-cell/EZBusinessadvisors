-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- seller_tiers_2026_08_31.sql — #2 seller self-serve tiers (spec Phase 1).
--   listings.seller_tier  'free' | 'paid' (default 'free')
--   listings.tier_paid_at timestamp when the paid tier was activated
-- Idempotent. Free = manual-entry only (Self-Reported label); paid = full AI
-- path (AI-Verified Financials). Legal-doc gate still applies to both.
-- =============================================================================

begin;

alter table public.listings add column if not exists seller_tier text not null default 'free';
alter table public.listings add column if not exists tier_paid_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_seller_tier_check') then
    alter table public.listings add constraint listings_seller_tier_check
      check (seller_tier in ('free', 'paid'));
  end if;
end $$;

create index if not exists listings_seller_tier_idx on public.listings (seller_tier, status);

commit;
