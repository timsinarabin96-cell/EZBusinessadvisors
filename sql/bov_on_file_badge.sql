-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- BOV-on-file trust badge: listings with a paid Broker Opinion of Value get a
-- public "📊 BOV on file" badge (like Verified Revenue). Owners buy the $99
-- valuation → finalizeValuationReport marks bov_on_file=true.
-- Idempotent.
-- =============================================================================

begin;

alter table public.listings add column if not exists bov_on_file boolean not null default false;
alter table public.public_listings add column if not exists bov_on_file boolean not null default false;

-- Backfill from existing ready valuation reports (trigger-safe: approved only).
update public.listings l
  set bov_on_file = true
  where exists (
    select 1 from public.valuation_reports vr
    where vr.listing_id = l.id and vr.status = 'ready'
  ) and l.bov_on_file = false;

update public.public_listings pl
  set bov_on_file = l.bov_on_file
  from public.listings l
  where l.id = pl.listing_id
    and l.review_stage = 'approved'
    and pl.bov_on_file = false;

commit;
