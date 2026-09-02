-- =============================================================================
-- 0012_seller_tiers.sql
-- -----------------------------------------------------------------------------
-- Convert sql/seller_tiers_2026_08_31.sql into the versioned migration path —
-- it was never numbered, so it was never applied to the live DB. Live sanity
-- check (2026-09-02) caught the fallout: both the seller-listing webhook
-- ($250 AI-Verified) and the franchise webhook write seller_tier/tier_paid_at,
-- and the update failed silently because the columns don't exist.
-- Idempotent. Free = manual-entry only (Self-Reported label); paid = full AI
-- path (AI-Verified Financials). Legal-doc gate still applies to both.
-- =============================================================================

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
