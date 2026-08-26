-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- License purchase (Stripe billing #3) — additive, safe to run repeatedly.
-- Adds license state columns to agencies for the white-label CRM license.
-- =============================================================================

alter table public.agencies
  add column if not exists licensed_at timestamptz;

-- Optional: RLS note — existing policies already cover agency row updates by
-- owners/admins; no new policies required for these columns.
