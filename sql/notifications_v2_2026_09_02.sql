-- Universal Notifications v2 preferences (2026-09-02).
-- Idempotent only; apply through the normal migration process.

alter table public.agencies
  add column if not exists notifications_hourly_digest boolean not null default true;

alter table public.profiles
  add column if not exists email_digest_hourly boolean not null default true;

update public.agencies
set notifications_hourly_digest = true
where notifications_hourly_digest is null;

update public.profiles
set email_digest_hourly = true
where email_digest_hourly is null;
