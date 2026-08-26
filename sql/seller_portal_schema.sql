-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Seller Portal — self-service tracking for sellers.
-- Adds a portal access token to seller_leads (and listings for converted
-- leads) so sellers can view progress, listing views, buyer interest, and
-- next steps via /seller/<token> without a login.
-- =============================================================================

alter table public.seller_leads
  add column if not exists portal_token text;

alter table public.listings
  add column if not exists portal_token text;

create index if not exists seller_leads_portal_token_idx
  on public.seller_leads (portal_token);

create index if not exists listings_portal_token_idx
  on public.listings (portal_token);
