-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- API KEYS REGISTRY + ACCOUNTANT SYNC SEED — 2026-08-26
-- Run this in the Supabase SQL Editor AFTER legal_vault_schema.sql.
--
-- 1) api_keys_registry: admin-only map of every API key, which provider/
--    website it connects to, and its purpose. This is the "what key goes
--    where" reference. Full secrets stay in .env.local / Vercel — this
--    table stores names, linked sites, and masked tails only.
-- 2) Seeds the $400 Fiverr build payment as a one-time expense.
-- =============================================================================

-- 1) Table
create table if not exists public.api_keys_registry (
  id          uuid primary key default gen_random_uuid(),
  key_name    text not null unique,          -- env var name, e.g. ANTHROPIC_API_KEY
  provider    text not null,                 -- e.g. Anthropic, DeepSeek, OpenAI
  website_url text,                          -- console/dashboard the key connects to
  purpose     text,                          -- what this key powers
  status      text not null default 'configured', -- configured | missing | revoked
  masked_tail text,                          -- last 4 chars, e.g. "…a1b2" (never full)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) RLS: admin-only (matches legal_vault pattern)
alter table public.api_keys_registry enable row level security;

drop policy if exists "api_keys_registry_admin_read" on public.api_keys_registry;
create policy "api_keys_registry_admin_read" on public.api_keys_registry
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

drop policy if exists "api_keys_registry_admin_write" on public.api_keys_registry;
create policy "api_keys_registry_admin_write" on public.api_keys_registry
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

-- 3) Seed — the full key map (names + linked websites + purpose).
--    status = 'configured' for keys present in .env.local; 'missing' for
--    OpenAI since no OPENAI_API_KEY is set yet (cost pull stays dormant until
--    you add it). Masked tails are placeholders — update with your real tails
--    via the admin page or leave blank.
insert into public.api_keys_registry (key_name, provider, website_url, purpose, status) values
('ANTHROPIC_API_KEY',         'Anthropic',   'https://console.anthropic.com',   'Claude AI — all financial/legal agents (document, training, lead)', 'configured'),
('DEEPSEEK_API_KEY',          'DeepSeek',    'https://platform.deepseek.com',   'DeepSeek AI — non-sensitive agents (support, booking) + admin expense categorization', 'configured'),
('OPENAI_API_KEY',            'OpenAI',      'https://platform.openai.com',     'OpenAI API — cost pull only; no key set yet (add to enable)', 'missing'),
('STRIPE_SECRET_KEY',         'Stripe',      'https://dashboard.stripe.com',    'Payments — subscriptions, buyer passes, success fees', 'configured'),
('STRIPE_WEBHOOK_SECRET',     'Stripe',      'https://dashboard.stripe.com',    'Payments — webhook signature verification', 'configured'),
('SUPABASE_SERVICE_ROLE_KEY', 'Supabase',    'https://supabase.com',            'Database/auth/storage — server-side admin operations (never client)', 'configured'),
('NEXT_PUBLIC_SUPABASE_URL',  'Supabase',    'https://supabase.com',            'Database — public project URL (safe to expose)', 'configured'),
('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase','https://supabase.com',            'Database — public anon key with RLS (safe to expose)', 'configured'),
('TWILIO_ACCOUNT_SID',        'Twilio',      'https://console.twilio.com',      'SMS/voice — account SID', 'configured'),
('TWILIO_AUTH_TOKEN',         'Twilio',      'https://console.twilio.com',      'SMS/voice — auth token', 'configured'),
('TWILIO_API_KEY_SID',        'Twilio',      'https://console.twilio.com',      'SMS/voice — API key SID', 'configured'),
('TWILIO_API_KEY_SECRET',     'Twilio',      'https://console.twilio.com',      'SMS/voice — API key secret', 'configured'),
('TWILIO_MESSAGING_SERVICE_SID', 'Twilio',   'https://console.twilio.com',      'SMS — messaging service', 'configured'),
('TWILIO_PHONE_NUMBER',       'Twilio',      'https://console.twilio.com',      'SMS/voice — outbound number', 'configured'),
('PLAID_CLIENT_ID',           'Plaid',       'https://dashboard.plaid.com',     'Financial data — client ID (bank connections)', 'configured'),
('PLAID_SECRET',              'Plaid',       'https://dashboard.plaid.com',     'Financial data — secret', 'configured'),
('PLAID_ENV',                 'Plaid',       'https://dashboard.plaid.com',     'Financial data — environment (sandbox/production)', 'configured'),
('FACEBOOK_APP_ID',           'Meta',        'https://developers.facebook.com', 'Social — Facebook app ID', 'configured'),
('FACEBOOK_APP_SECRET',       'Meta',        'https://developers.facebook.com', 'Social — Facebook app secret', 'configured'),
('INSTAGRAM_APP_ID',          'Meta',        'https://developers.facebook.com', 'Social — Instagram app ID', 'configured'),
('INSTAGRAM_APP_SECRET',      'Meta',        'https://developers.facebook.com', 'Social — Instagram app secret', 'configured'),
('TIKTOK_CLIENT_KEY',         'TikTok',      'https://developers.tiktok.com',   'Social — TikTok client key', 'configured'),
('TIKTOK_CLIENT_SECRET',      'TikTok',      'https://developers.tiktok.com',   'Social — TikTok client secret', 'configured'),
('X_CLIENT_ID',               'X (Twitter)', 'https://developer.x.com',         'Social — X client ID', 'configured'),
('X_CLIENT_SECRET',           'X (Twitter)', 'https://developer.x.com',         'Social — X client secret', 'configured'),
('VERCEL_OIDC_TOKEN',         'Vercel',      'https://vercel.com',              'Deploy — OIDC token for CI', 'configured'),
('VAPID_PUBLIC_KEY',          'Web Push',    'https://web-push-codelab.glitch.me/', 'Push notifications — public key', 'configured'),
('VAPID_PRIVATE_KEY',         'Web Push',    'https://web-push-codelab.glitch.me/', 'Push notifications — private key', 'configured'),
('VAPID_SUBJECT',             'Web Push',    'https://web-push-codelab.glitch.me/', 'Push notifications — contact email', 'configured'),
('CRON_SECRET',               'Internal',    'https://vercel.com',              'Cron job auth — protects scheduled tasks', 'configured'),
('VERCEL_OIDC_TOKEN',         'Vercel',      'https://vercel.com',              'Deploy — OIDC token', 'configured')
on conflict (key_name) do update set
  provider = excluded.provider,
  website_url = excluded.website_url,
  purpose = excluded.purpose,
  status = excluded.status,
  updated_at = now();

-- 4) Seed the $400 Fiverr build payment as a one-time expense (tools).
--    Runs only if a matching Fiverr line doesn't already exist.
insert into public.expenses (category, vendor, description, amount_cents, currency, expense_date, recurring, paid, notes)
select 'tools', 'Fiverr', 'Fiverr — AI assistant / platform build (one-time)', 40000, 'USD', current_date, false, true,
       'One-time development payment to Fiverr contractor'
where not exists (
  select 1 from public.expenses where vendor = 'Fiverr' and description like 'Fiverr — AI assistant%'
);

-- 5) Verify: select key_name, provider, status from public.api_keys_registry order by provider;
