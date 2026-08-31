-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- License subscriptions (Phase 3) — recurring CRM subscriptions.
-- The `licenses` table is the SOURCE OF TRUTH for a licensed broker agency's
-- subscription: plan, billing cycle, seat count, Stripe subscription refs,
-- billing anchor (period), and cancel-at-period-end state.
-- Additive — safe to run repeatedly.
-- =============================================================================

create table if not exists public.licenses (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null unique references public.agencies(id) on delete cascade,
  plan_type             text not null default 'professional',   -- professional | enterprise
  billing_cycle         text not null default 'monthly',        -- monthly | annual
  status                text not null default 'active',         -- active | past_due | canceled | trialing
  seats                 integer not null default 3 check (seats >= 3),
  stripe_customer       text,
  stripe_subscription   text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  cancel_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint licenses_plan_type_check  check (plan_type in ('professional', 'enterprise')),
  constraint licenses_cycle_check      check (billing_cycle in ('monthly', 'annual')),
  constraint licenses_status_check     check (status in ('active', 'past_due', 'canceled', 'trialing'))
);

create index if not exists licenses_agency_idx        on public.licenses (agency_id);
create index if not exists licenses_stripe_sub_idx    on public.licenses (stripe_subscription);
create index if not exists licenses_status_idx        on public.licenses (status);

-- RLS: agency members may read their own license row; the service-role server
-- client (webhook + API routes) bypasses RLS for writes.
alter table public.licenses enable row level security;

drop policy if exists licenses_agency_select on public.licenses;
create policy licenses_agency_select on public.licenses
  for select to authenticated
  using (public.is_agency_member(agency_id));

drop policy if exists licenses_agency_update on public.licenses;
create policy licenses_agency_update on public.licenses
  for update to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));
