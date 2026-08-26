-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- Agencies table is missing billing/trial columns the app code inserts.
alter table public.agencies
  add column if not exists plan_type text,
  add column if not exists trial_start_date timestamptz,
  add column if not exists trial_end_date timestamptz,
  add column if not exists grace_end_date timestamptz,
  add column if not exists trial_active boolean default false,
  add column if not exists paid_plan_active boolean default false;
