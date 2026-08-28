-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Verified-seller badge — public trust signal.
-- listings.seller_verified = true when the owner passed the Identity Gate
-- (verified email + phone OTP + profile photo + attestation). Copied into
-- public_listings so the public feed/detail pages can show the 🛡️ badge.
-- NOTE: public_listings updates are guarded by trg_enforce_listing_approved
-- (published rows require review_stage='approved'), so the backfill only
-- touches approved listings.
-- Idempotent.
-- =============================================================================

begin;

alter table public.listings add column if not exists seller_verified boolean not null default false;
alter table public.public_listings add column if not exists seller_verified boolean not null default false;

-- Backfill listings: any owner listing that already has an attestation
-- (i.e. passed the identity gate) is verified.
update public.listings
  set seller_verified = true
  where owner_email is not null
    and attestation_accepted_at is not null
    and seller_verified = false;

-- Backfill public_listings ONLY for approved listings (trigger-safe).
update public.public_listings pl
  set seller_verified = l.seller_verified
  from public.listings l
  where l.id = pl.listing_id
    and l.review_stage = 'approved'
    and pl.seller_verified = false;

commit;
