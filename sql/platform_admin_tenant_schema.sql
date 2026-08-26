-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Platform admin + per-tenant settings schema
-- -----------------------------------------------------------------------------
-- 1) platform_admins — the platform owner (boss) gets a dedicated admin flag.
-- 2) agency_settings — each sold CRM runs on its OWN domain + OWN API keys
--    (DeepSeek, Supabase project, Stripe, branding). Buyer covers all costs.
-- 3) profiles.role gains 'super_admin' + explicit broker/agent distinction.
-- =============================================================================

-- --- 1) Platform admins ------------------------------------------------------
create table if not exists public.platform_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);
alter table public.platform_admins enable row level security;
drop policy if exists "platform_admins are readable by service" on public.platform_admins;
create policy "platform_admins are readable by service" on public.platform_admins
  for select using (true);

-- --- 2) Per-agency tenant settings (own domain + own API keys) ---------------
create table if not exists public.agency_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  -- Own domain for this sold CRM (e.g. acme.crm.com)
  custom_domain text,
  -- Own API keys — buyer pays all usage
  deepseek_api_key text,
  deepseek_base_url text default 'https://api.deepseek.com',
  supabase_project_url text,
  supabase_anon_key text,
  supabase_service_key text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  -- AI model preference
  ai_provider text not null default 'deepseek',
  ai_model text default 'deepseek-v4-flash',
  -- White-label identity
  platform_name text,
  support_email text,
  -- Timestamps
  updated_at timestamptz not null default now()
);
alter table public.agency_settings enable row level security;

drop policy if exists "agency settings readable by agency members" on public.agency_settings;
create policy "agency settings readable by agency members" on public.agency_settings
  for select using (
    exists (select 1 from public.agency_members m
            where m.agency_id = agency_settings.agency_id
              and m.profile_id = auth.uid())
  );

drop policy if exists "agency settings writable by agency admins" on public.agency_settings;
create policy "agency settings writable by agency admins" on public.agency_settings
  for all using (
    exists (select 1 from public.agency_members m
            where m.agency_id = agency_settings.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  ) with check (
    exists (select 1 from public.agency_members m
            where m.agency_id = agency_settings.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  );

-- Seed a settings row for every existing agency (defaults only — no keys).
insert into public.agency_settings (agency_id, custom_domain, ai_provider, ai_model)
select id, custom_domain, 'deepseek', 'deepseek-v4-flash'
from public.agencies
on conflict (agency_id) do nothing;

-- --- 3) Profiles: super_admin role + normalize roles -------------------------
alter table public.profiles add column if not exists role text not null default 'agent';

-- Widen the role CHECK constraint to include super_admin (drop old, add new).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'broker', 'agent', 'associate'));

-- Upgrade boss's profile to super_admin by email (idempotent).
update public.profiles
set role = 'super_admin'
where email in ('rtimsina@ezbusinessadvisors.com', 'timsinarabin@outlook.com');

-- Add platform admin rows for those profiles (idempotent).
insert into public.platform_admins (profile_id, note)
select p.id, 'Platform owner'
from public.profiles p
where p.email in ('rtimsina@ezbusinessadvisors.com', 'timsinarabin@outlook.com')
on conflict (profile_id) do nothing;
