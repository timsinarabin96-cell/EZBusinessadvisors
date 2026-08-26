-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Admin control plane (#12578): audit log + listing moderation columns.
-- Additive + idempotent. Run via Management API (already applied to prod).
-- =============================================================================

begin;

-- --- 1) Admin audit log ------------------------------------------------------
-- Every platform-admin action lands here: who did what, to whom, when.
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,               -- create_user | role_change | ban | unban | lock | unlock | status_change | agency_link | moderate_listing | delete_agency | expense_create | expense_delete | ...
  target_type  text not null,               -- user | agency | listing | subscription | expense | settings
  target_id    text,
  target_label text,                        -- human-readable: email, name, business_name
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_created_idx  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_target_idx   on public.admin_audit_log (target_type, target_id);
create index if not exists admin_audit_actor_idx    on public.admin_audit_log (actor_id);
create index if not exists admin_audit_action_idx   on public.admin_audit_log (action);

-- --- 2) Listing moderation columns -------------------------------------------
-- Why a listing was rejected/withdrawn, and by whom, for the admin queue.
alter table public.listings add column if not exists moderation_reason text;
alter table public.listings add column if not exists moderated_by uuid;
alter table public.listings add column if not exists moderated_at timestamptz;

commit;
