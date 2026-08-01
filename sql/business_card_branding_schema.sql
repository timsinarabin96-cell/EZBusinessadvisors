-- =============================================================================
-- Per-Broker Business Card Branding
-- -----------------------------------------------------------------------------
-- Extends the existing white-label branding model with full business-card
-- theming. Agencies already carry brand_color / accent_color / logo_url; we add
-- the richer font + secondary/accent palette. Brokers get override fields on
-- broker_profiles so they can inherit the agency default or opt out with their
-- own colors, font, and logo.
--
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ---- agencies: agency-wide default business-card brand ----------------------
alter table public.agencies
  add column if not exists brand_primary_color   text default '#1a1a2e',
  add column if not exists brand_secondary_color text default '#16213e',
  add column if not exists brand_accent_color    text default '#c9a84c',
  add column if not exists brand_font            text default 'Georgia, serif',
  add column if not exists brand_logo_url        text;

-- ---- broker_profiles: per-broker overrides -----------------------------------
-- NULL values mean "inherit the agency default". Layout is a front-facing
-- preset key: 'classic' | 'minimal' | 'modern' | 'split'.
alter table public.broker_profiles
  add column if not exists card_primary_color   text,
  add column if not exists card_secondary_color text,
  add column if not exists card_accent_color    text,
  add column if not exists card_font            text,
  add column if not exists card_logo_url        text,
  add column if not exists card_layout          text;

-- ---- indexes (cheap, idempotent) ---------------------------------------------
create index if not exists idx_broker_profiles_agency on public.broker_profiles (agency_id);
