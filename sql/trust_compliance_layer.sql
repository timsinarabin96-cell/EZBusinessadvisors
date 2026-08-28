-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Trust & Compliance layer (boss: "I don't want to get sued — verification,
-- attestation, seller alerts, profile with photo")
--   * profiles: phone + phone_verified_at + profile_completed_at
--   * listings: seller attestation (own-risk acknowledgment, stored proof)
--   * phone_verifications: OTP table (service-role only; no client policies)
-- Idempotent. Run in Supabase SQL Editor or via the management API.
-- =============================================================================

begin;

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists profile_completed_at timestamptz;

alter table public.listings add column if not exists attestation_accepted_at timestamptz;
alter table public.listings add column if not exists attestation_ip text;
alter table public.listings add column if not exists attestation_text text;

create table if not exists public.phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  attempts    int  not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists phone_verifications_phone_idx on public.phone_verifications (phone, created_at desc);

alter table public.phone_verifications enable row level security;
-- Service-role only: no anon/authenticated access to OTP codes.
revoke all on public.phone_verifications from anon, authenticated;
revoke all on public.phone_verifications from public;

commit;
