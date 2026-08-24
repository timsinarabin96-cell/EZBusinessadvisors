-- =============================================================================
-- Listing flags + SBA qualification (boss's requirements)
-- -----------------------------------------------------------------------------
-- listings gains:
--   * flagged         — system flagged the listing as unwanted/premature
--   * flag_reasons    — why it was flagged (readiness gaps, missing financials)
--   * sba_qualified   — shows buyers whether the business is SBA-financeable
-- =============================================================================

alter table public.listings add column if not exists flagged boolean not null default false;
alter table public.listings add column if not exists flag_reasons text[] not null default '{}';
alter table public.listings add column if not exists sba_qualified boolean not null default false;

-- Expose in the public feed (SBA badge + status already added earlier).
