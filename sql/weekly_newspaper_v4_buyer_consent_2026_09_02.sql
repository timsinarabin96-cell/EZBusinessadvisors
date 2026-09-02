-- =============================================================================
-- Weekly Newspaper v4 — explicit buyer consent for manual "Add Buyer" flows,
-- multi-agency subscription isolation.
-- -----------------------------------------------------------------------------
-- Boss requirement: when a broker manually adds a buyer (CRM lead form, CSV
-- import, etc.), the weekly buyer newsletter must be OPT-IN, default
-- unchecked. No checkbox → no subscription → no send, ever. Must hold across
-- every agency independently (agency A's consent can never cause agency B's
-- buyers to be mailed, and vice versa).
-- Idempotent, additive only. No RLS weakened.
-- =============================================================================

-- 1. Explicit consent flag on the buyer record itself (source of truth for
--    "did we ask, and did they say yes").
alter table if exists public.buyer_leads
  add column if not exists newsletter_opt_in boolean not null default false;

-- 2. Multi-agency scoping on subscriptions: each agency's opted-in buyers get
--    their own subscription row scoped to that agency, so agency B can never
--    see/manage/send-to a buyer that only agency A has consent for, even if
--    the same email address exists as a lead in both agencies independently.
alter table if exists public.newspaper_subscriptions
  add column if not exists agency_id uuid;

alter table if exists public.newspaper_subscriptions
  add column if not exists consent_source text; -- e.g. 'manual_add', 'csv_import', 'public_signup'

-- Re-scope the v3 unique index to include agency (NULL agency_id = platform
-- house list from public signups, distinct per email+audience).
drop index if exists newspaper_subscriptions_email_audience_idx;
create unique index if not exists newspaper_subscriptions_email_audience_agency_idx
  on public.newspaper_subscriptions (lower(email), audience, coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 3. Delivery log agency column (v3 already added `audience`; add `agency_id`
--    too for reporting / audit of which agency's send included which buyer).
alter table if exists public.newspaper_delivery_log
  add column if not exists agency_id uuid;

-- No RLS changes. buyer_leads and newspaper_subscriptions RLS remain exactly
-- as configured (agency-scoped `is_agency_member` policies on buyer_leads;
-- newspaper_subscriptions writes for consent-mirroring go through the
-- service-role API routes, same pattern as v3, not direct client writes).
