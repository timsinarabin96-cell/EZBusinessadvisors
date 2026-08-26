-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Brokerage Operating System — AI-ready marketplace foundation
-- Additive/idempotent. Does not publish, delete, or overwrite listing records.
-- Apply only after reviewing the target project and taking a schema snapshot.
-- =============================================================================

begin;

alter table public.listings add column if not exists sub_industry text;
alter table public.listings add column if not exists established_year integer;
alter table public.listings add column if not exists employees_full_time integer;
alter table public.listings add column if not exists employees_part_time integer;
alter table public.listings add column if not exists owner_hours_weekly numeric;
alter table public.listings add column if not exists growth_opportunities text;
alter table public.listings add column if not exists competitive_advantages text;
alter table public.listings add column if not exists customer_concentration text;
alter table public.listings add column if not exists facilities_summary text;
alter table public.listings add column if not exists lease_monthly numeric;
alter table public.listings add column if not exists lease_expires_on date;
alter table public.listings add column if not exists seller_financing_available boolean not null default false;
alter table public.listings add column if not exists financing_notes text;
alter table public.listings add column if not exists transition_support text;
alter table public.listings add column if not exists training_period_weeks integer;
alter table public.listings add column if not exists confidentiality_level text not null default 'anonymous';
alter table public.listings add column if not exists intake_source text not null default 'broker_manual';
alter table public.listings add column if not exists ai_metadata jsonb not null default '{}'::jsonb;
alter table public.listings add column if not exists ai_readiness_score integer not null default 0;
alter table public.listings add column if not exists compliance_status text not null default 'pending';
alter table public.listings add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.listings add column if not exists approved_at timestamptz;
alter table public.listings add column if not exists commission_split_agent numeric;
alter table public.listings add column if not exists commission_split_brokerage numeric;

alter table public.broker_profiles add column if not exists expertise text[] not null default '{}';
alter table public.broker_profiles add column if not exists industries text[] not null default '{}';
alter table public.broker_profiles add column if not exists markets text[] not null default '{}';
alter table public.broker_profiles add column if not exists years_experience integer;
alter table public.broker_profiles add column if not exists credentials text[] not null default '{}';
alter table public.broker_profiles add column if not exists languages text[] not null default '{}';
alter table public.broker_profiles add column if not exists closed_deals_count integer not null default 0;
alter table public.broker_profiles add column if not exists transaction_value_total numeric not null default 0;
alter table public.broker_profiles add column if not exists booking_url text;
alter table public.broker_profiles add column if not exists service_areas text[] not null default '{}';
alter table public.broker_profiles add column if not exists profile_status text not null default 'draft';

alter table public.agencies add column if not exists custom_domain text;
alter table public.agencies add column if not exists copyright_name text;
alter table public.agencies add column if not exists default_agent_split numeric not null default 50;
alter table public.agencies add column if not exists listing_approval_required boolean not null default true;
alter table public.agencies add column if not exists compliance_review_required boolean not null default true;

alter table public.agency_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.agency_members add column if not exists commission_split numeric;
alter table public.agency_members add column if not exists hiring_status text not null default 'active';
alter table public.agency_members add column if not exists training_required boolean not null default true;
alter table public.agency_members add column if not exists certification_status text not null default 'pending';

do $$ begin
  alter table public.listings add constraint listings_confidentiality_level_check
    check (confidentiality_level in ('anonymous','qualified_buyers','broker_only'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.listings add constraint listings_intake_source_check
    check (intake_source in ('broker_manual','seller_self_service','ai_phone','import'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.listings add constraint listings_ai_readiness_score_check
    check (ai_readiness_score between 0 and 100);
exception when duplicate_object then null; end $$;

create table if not exists public.buyer_search_profiles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  name text,
  industries text[] not null default '{}',
  locations text[] not null default '{}',
  min_price numeric,
  max_price numeric,
  min_revenue numeric,
  min_sde numeric,
  available_cash numeric,
  financing_methods text[] not null default '{}',
  owner_involvement text,
  timeline text,
  proof_of_funds_status text not null default 'not_requested',
  nda_status text not null default 'not_requested',
  notification_email boolean not null default true,
  notification_sms boolean not null default false,
  notification_frequency text not null default 'instant',
  ai_match_enabled boolean not null default true,
  active boolean not null default true,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_listing_orders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  seller_profile_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  plan_code text not null,
  amount_cents integer not null,
  status text not null default 'pending',
  provider text,
  provider_session_id text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_review_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_stage text,
  to_stage text not null,
  notes text,
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  provider text not null,
  account_label text,
  status text not null default 'disconnected',
  credential_reference text,
  settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, provider, account_label)
);

create table if not exists public.agency_ai_providers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  purpose text not null,
  provider text not null,
  model text not null,
  credential_reference text,
  enabled boolean not null default true,
  monthly_budget_cents integer,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, purpose)
);

create table if not exists public.agency_site_themes (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  custom_domain text,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#102a43',
  secondary_color text not null default '#2563eb',
  accent_color text not null default '#38bdf8',
  heading_font text not null default 'system',
  body_font text not null default 'system',
  hero_style text not null default 'editorial',
  listing_card_style text not null default 'intelligence',
  business_model text not null default 'full_service_brokerage',
  navigation jsonb not null default '[]'::jsonb,
  homepage_sections jsonb not null default '[]'::jsonb,
  legal_disclosures jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.compliance_policy_packs (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  transaction_type text not null default 'business_sale',
  version text not null,
  status text not null default 'draft',
  rules jsonb not null default '[]'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  effective_on date,
  expires_on date,
  unique (jurisdiction, transaction_type, version)
);

create index if not exists buyer_search_profiles_match_idx
  on public.buyer_search_profiles (active, max_price, min_revenue, min_sde);
create index if not exists listing_review_events_listing_idx
  on public.listing_review_events (listing_id, created_at desc);
create index if not exists seller_listing_orders_agency_idx
  on public.seller_listing_orders (agency_id, status, created_at desc);

alter table public.buyer_search_profiles enable row level security;
alter table public.seller_listing_orders enable row level security;
alter table public.listing_review_events enable row level security;
alter table public.marketplace_connections enable row level security;
alter table public.agency_ai_providers enable row level security;
alter table public.agency_site_themes enable row level security;
alter table public.compliance_policy_packs enable row level security;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'buyer_search_profiles','seller_listing_orders','listing_review_events',
    'marketplace_connections','agency_ai_providers','agency_site_themes'
  ] loop
    execute format('drop policy if exists %I on public.%I', target_table || '_agency_access', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))',
      target_table || '_agency_access', target_table
    );
  end loop;
end $$;

drop policy if exists compliance_policy_packs_authenticated_read on public.compliance_policy_packs;
create policy compliance_policy_packs_authenticated_read on public.compliance_policy_packs
  for select to authenticated using (status = 'approved');

revoke all on public.buyer_search_profiles, public.seller_listing_orders,
  public.listing_review_events, public.marketplace_connections,
  public.agency_ai_providers, public.agency_site_themes,
  public.compliance_policy_packs from anon;

revoke truncate, references, trigger on public.buyer_search_profiles,
  public.seller_listing_orders, public.listing_review_events,
  public.marketplace_connections, public.agency_ai_providers,
  public.agency_site_themes, public.compliance_policy_packs from authenticated;

grant select, insert, update, delete on public.buyer_search_profiles,
  public.seller_listing_orders, public.listing_review_events,
  public.marketplace_connections, public.agency_ai_providers,
  public.agency_site_themes to authenticated;
grant select on public.compliance_policy_packs to authenticated;

commit;
