-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- ============================================================
-- CONCORD PLATFORM - SCHEMA STABILIZATION PATCH (verified build)
-- Auto-generated from sql/ schema files. Safe: CREATE TABLE IF NOT EXISTS only.
-- NO DROP, NO TRUNCATE, NO DELETE. Transactional via DO $$ block.
-- ============================================================

DO $$
BEGIN
  -- trial_settings
  create table if not exists public.trial_settings (
      id              uuid primary key default gen_random_uuid(),
      agency_id       uuid references public.agencies(id) on delete cascade,  -- null = global default
      trial_days      int not null default 14,
      max_listings    int not null default 5,
      max_leads       int not null default 20,
      max_deals       int not null default 5,
      max_agents      int not null default 3,
      max_storage_mb  bigint not null default 100,
      send_reminders  boolean not null default true,
      grace_days      int not null default 7,
      archive_days    int not null default 30,
      created_at      timestamptz not null default now()
    );
  -- agency_usage
  create table if not exists public.agency_usage (
      id            uuid primary key default gen_random_uuid(),
      agency_id     uuid not null references public.agencies(id) on delete cascade,
      listings_used int not null default 0,
      leads_used    int not null default 0,
      deals_used    int not null default 0,
      storage_used  bigint not null default 0,        -- bytes
      period_start  timestamptz not null,
      period_end    timestamptz not null,
      created_at    timestamptz not null default now()
    );
  -- !! subscriptions: NO schema definition found, SKIPPED
  -- subscription_history
  create table if not exists public.subscription_history (
      id         uuid primary key default gen_random_uuid(),
      agency_id  uuid not null references public.agencies(id) on delete cascade,
      plan_type  text not null default 'trial',       -- trial | starter | professional | enterprise
      start_date timestamptz not null default now(),
      end_date   timestamptz,
      amount     numeric(10,2) not null default 0,
      status     text not null default 'active',      -- active | converted | expired | cancelled | grace
      notes      text,
      created_at timestamptz not null default now()
    );
  -- social_connections
  create table if not exists public.social_connections (
      id               uuid primary key default gen_random_uuid(),
      agent_id         uuid references public.profiles(id) on delete cascade not null,
      platform         text not null check (platform in ('instagram','facebook','tiktok','x')),
      access_token     text,
      refresh_token    text,
      platform_user_id text,
      platform_username text,
      platform_name    text,
      expires_at       timestamptz,
      is_active        boolean not null default true,
      created_at       timestamptz not null default now(),
      updated_at       timestamptz not null default now(),
      unique (agent_id, platform)
    );
  -- social_posts
  create table if not exists public.social_posts (
      id               uuid primary key default gen_random_uuid(),
      listing_id       uuid references public.listings(id) on delete cascade,
      agent_id         uuid references public.profiles(id) on delete cascade not null,
      platform         text not null check (platform in ('instagram','facebook','tiktok','x')),
      post_id          text,
      post_url         text,
      content          text,
      image_urls       text[] default '{}',
      scheduled_for    timestamptz,
      posted_at        timestamptz,
      status           text not null default 'pending'
                       check (status in ('pending','posted','failed','scheduled')),
      error            text,
      engagement_likes    integer not null default 0,
      engagement_comments integer not null default 0,
      engagement_shares   integer not null default 0,
      created_at       timestamptz not null default now()
    );
  -- social_settings
  create table if not exists public.social_settings (
      id                uuid primary key default gen_random_uuid(),
      agent_id          uuid references public.profiles(id) on delete cascade not null,
      platform          text not null check (platform in ('instagram','facebook','tiktok','x')),
      auto_post_enabled boolean not null default true,
      post_template     text,
      include_images    boolean not null default true,
      include_link      boolean not null default true,
      hashtags          text,
      custom_message    text,
      schedule_time     time,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      unique (agent_id, platform)
    );
  -- !! search_log: NO schema definition found, SKIPPED
  -- invoices
  create table if not exists public.invoices (
      id               uuid primary key default gen_random_uuid(),
      subscription_id  uuid references public.subscriptions(id) on delete cascade,
      profile_id       uuid references public.profiles(id),
      amount           numeric not null,
      currency         text not null default 'usd',
      stripe_invoice   text,
      status           text not null default 'open',  -- open | paid | void | uncollectible
      pdf_url          text,
      due_date         timestamptz,
      paid_at          timestamptz,
      created_at       timestamptz not null default now()
    );
  -- webhook_events
  create table if not exists public.webhook_events (
      id            uuid primary key default gen_random_uuid(),
      provider      text not null,             -- bizbuysell | stripe
      event_type    text,
      payload_json  jsonb,
      processed     boolean not null default false,
      created_at    timestamptz not null default now()
    );
  -- bbs_syncs
  create table if not exists public.bbs_syncs (
      id            uuid primary key default gen_random_uuid(),
      listing_id    uuid references public.listings(id) on delete cascade,
      provider      text not null default 'bizbuysell',
      external_id   text,
      status        text not null default 'pending',  -- pending | synced | failed | removed
      last_sync_at  timestamptz,
      payload_json  jsonb,
      error         text,
      created_at    timestamptz not null default now()
    );
  -- recast_projects
  create table if not exists public.recast_projects (
      id              uuid primary key default gen_random_uuid(),
      listing_id      uuid references public.listings(id) on delete set null,
      business_name   text not null,
      entity_type     text not null default 's_corp',   -- s_corp | c_corp | llc | partnership | sole_prop
      currency        text not null default '$',
      years_json      jsonb not null default '[]'::jsonb,
      addbacks_json   jsonb not null default '[]'::jsonb,
      result_json     jsonb,
      status          text not null default 'draft',    -- draft | finalized
      created_by      uuid references public.profiles(id),
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );
  -- document_templates
  create table if not exists public.document_templates (
      id            uuid primary key default gen_random_uuid(),
      name          text not null,
      description   text,
      category      text not null default 'other',
      fields        jsonb not null default '[]',
      parties       jsonb not null default '[]',
      body_template text,                        -- optional markdown/HTML skeleton with {{field.key}} placeholders
      is_active     boolean not null default true,
      created_by    uuid references public.profiles(id) on delete set null,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    );
  -- documents
  create table if not exists public.documents (
      id            uuid primary key default gen_random_uuid(),
      template_id   uuid references public.document_templates(id) on delete set null,
      listing_id    uuid references public.listings(id) on delete cascade,
      deal_id       uuid references public.deals(id) on delete set null,
      title         text not null,
      status        text not null default 'draft'
                    check (status in ('draft','pending_signature','signed','rejected','archived')),
      filled_data   jsonb not null default '{}',
      parties       jsonb not null default '[]',
      created_by    uuid references public.profiles(id) on delete set null,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    );
  -- document_signatures
  create table if not exists public.document_signatures (
      id            uuid primary key default gen_random_uuid(),
      document_id   uuid references public.documents(id) on delete cascade,
      party_key     text not null,               -- matches parties[].key
      party_name    text,
      party_email   text,
      role          text,                        -- agent | seller | buyer | custom
      status        text not null default 'unsigned'
                    check (status in ('unsigned','signed','declined','expired')),
      signature_data jsonb,                      -- SVG data URL or {name, ip, ts}
      signed_at     timestamptz,
      created_at    timestamptz not null default now()
    );
  -- document_audit_logs
  create table if not exists public.document_audit_logs (
      id            uuid primary key default gen_random_uuid(),
      document_id   uuid references public.documents(id) on delete cascade,
      actor_id      uuid references public.profiles(id) on delete set null,
      action        text not null,               -- created | filled | sent | signed | declined | status_changed | archived
      detail        jsonb,
      created_at    timestamptz not null default now()
    );

  -- RLS enforcement (safe if already set)
  ALTER TABLE public.trial_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.agency_usage ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.social_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.document_audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.search_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.bbs_syncs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.recast_projects ENABLE ROW LEVEL SECURITY;

  RAISE NOTICE 'Schema stabilization applied successfully.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR: %', SQLERRM;
  RAISE;
END $$;
