-- =============================================================================
-- AI Control Center + Paid Valuation Reports schema
-- -----------------------------------------------------------------------------
-- 1) ai_agent_config — per-tenant AI agent toggles + model overrides.
--    agency_id NULL = platform default; agency row overrides.
-- 2) platform_settings — key/value store (Twilio keys for the phone system,
--    default AI provider, etc.) so the boss can configure without touching
--    .env files.
-- 3) valuation_reports — paid valuation report orders ($199 standard, $499
--    full BOV + teaser). The generated PDF URL is stored here.
-- =============================================================================

-- --- 1) AI agent config ------------------------------------------------------
create table if not exists public.ai_agent_config (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  agent_key text not null,            -- autopilot | deal_doctor | red_flags | phone | training | marketing | lead_score
  enabled boolean not null default true,
  model text,                         -- optional per-agent model override
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, agent_key)
);

alter table public.ai_agent_config enable row level security;
drop policy if exists "ai config readable by agency members" on public.ai_agent_config;
create policy "ai config readable by agency members" on public.ai_agent_config
  for select using (
    agency_id is null or
    exists (select 1 from public.agency_members m
            where m.agency_id = ai_agent_config.agency_id
              and m.profile_id = auth.uid())
  );
drop policy if exists "ai config writable by admins" on public.ai_agent_config;
create policy "ai config writable by admins" on public.ai_agent_config
  for all using (
    agency_id is null or
    exists (select 1 from public.agency_members m
            where m.agency_id = ai_agent_config.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  ) with check (true);

-- --- 2) Platform settings (key/value) ----------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
drop policy if exists "platform settings readable" on public.platform_settings;
create policy "platform settings readable" on public.platform_settings
  for select using (true);
drop policy if exists "platform settings writable by service" on public.platform_settings;
create policy "platform settings writable by service" on public.platform_settings
  for all using (true) with check (true);

-- Seed default AI agent keys (platform-wide).
insert into public.ai_agent_config (agency_id, agent_key, enabled)
select null, k, true from unnest(array['autopilot','deal_doctor','red_flags','phone','training','marketing','lead_score']) as k
on conflict (agency_id, agent_key) do nothing;

-- --- 3) Paid valuation reports ------------------------------------------------
create table if not exists public.valuation_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  agency_id uuid references public.agencies(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  tier text not null default 'standard' check (tier in ('standard','full_bov')),
  amount_cents integer not null default 19900,
  status text not null default 'pending' check (status in ('pending','paid','generating','ready','failed')),
  report_url text,
  stripe_session text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.valuation_reports enable row level security;
drop policy if exists "valuation reports readable by owner" on public.valuation_reports;
create policy "valuation reports readable by owner" on public.valuation_reports
  for select using (auth.uid() = profile_id);
drop policy if exists "valuation reports writable by service" on public.valuation_reports;
create policy "valuation reports writable by service" on public.valuation_reports
  for all using (true) with check (true);
