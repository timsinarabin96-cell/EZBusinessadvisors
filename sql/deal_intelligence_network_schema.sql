-- =============================================================================
-- Concord Deal Intelligence Network
-- Verified Deal Passport, permission-aware AI, engagement, offer lab,
-- cooperative exchange, value growth, transition, recruiting, and trust.
-- Additive/idempotent. Does not publish or delete records.
-- =============================================================================

begin;

-- Harden the existing virtual data room before adding AI access. Membership is
-- inherited from the parent room; no authenticated user receives global room
-- access merely for being signed in.
alter table if exists public.data_rooms add column if not exists agency_id uuid references public.agencies(id) on delete cascade;

update public.data_rooms room
set agency_id = deal.agency_id
from public.deals deal
where room.agency_id is null and room.deal_id = deal.id;

update public.data_rooms room
set agency_id = listing.agency_id
from public.listings listing
where room.agency_id is null and room.listing_id = listing.id;

do $$ begin
  if not exists (select 1 from public.data_rooms where agency_id is null) then
    alter table public.data_rooms alter column agency_id set not null;
  end if;
end $$;

-- The previous schema used broad authenticated policies. Replace them with
-- agency-scoped policies for every internal data-room surface.
drop policy if exists "dr_select" on public.data_rooms;
drop policy if exists "dr_insert" on public.data_rooms;
drop policy if exists "dr_update" on public.data_rooms;
drop policy if exists "dr_delete" on public.data_rooms;
drop policy if exists data_rooms_agency_access on public.data_rooms;
create policy data_rooms_agency_access on public.data_rooms for all to authenticated
  using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

do $$
declare target_table text;
declare old_policy text;
begin
  -- Tables with a direct data_room_id column.
  foreach target_table in array array[
    'data_room_folders','data_room_files','data_room_shares','data_room_buyers',
    'data_room_activities'
  ] loop
    for old_policy in select policyname from pg_policies where schemaname = 'public' and tablename = target_table loop
      execute format('drop policy if exists %I on public.%I', old_policy, target_table);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.data_rooms room where room.id = data_room_id and public.is_agency_member(room.agency_id))) with check (exists (select 1 from public.data_rooms room where room.id = data_room_id and public.is_agency_member(room.agency_id)))',
      target_table || '_agency_access', target_table
    );
  end loop;

  -- Tables that link to a room through data_room_files.file_id.
  foreach target_table in array array[
    'data_room_comments','data_room_view_logs','data_room_download_logs'
  ] loop
    for old_policy in select policyname from pg_policies where schemaname = 'public' and tablename = target_table loop
      execute format('drop policy if exists %I on public.%I', old_policy, target_table);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.data_room_files f join public.data_rooms room on room.id = f.data_room_id where f.id = file_id and public.is_agency_member(room.agency_id))) with check (exists (select 1 from public.data_room_files f join public.data_rooms room on room.id = f.data_room_id where f.id = file_id and public.is_agency_member(room.agency_id)))',
      target_table || '_agency_access', target_table
    );
  end loop;

  -- Recycle bin has no room link; broker/admin only.
  for old_policy in select policyname from pg_policies where schemaname = 'public' and tablename = 'data_room_trash' loop
    execute format('drop policy if exists %I on public.data_room_trash', old_policy);
  end loop;
  execute 'create policy data_room_trash_agency_access on public.data_room_trash for all to authenticated using (public.is_broker_or_admin()) with check (public.is_broker_or_admin())';
end $$;

create table if not exists public.deal_passports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  verification_score integer not null default 0 check (verification_score between 0 and 100),
  liquidity_score integer not null default 0 check (liquidity_score between 0 and 100),
  financing_score integer not null default 0 check (financing_score between 0 and 100),
  documentation_score integer not null default 0 check (documentation_score between 0 and 100),
  risk_flags jsonb not null default '[]'::jsonb,
  readiness_actions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id)
);

create table if not exists public.deal_fact_evidence (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  passport_id uuid not null references public.deal_passports(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  fact_key text not null,
  fact_label text not null,
  fact_value jsonb,
  verification_level text not null default 'seller_stated',
  source_type text,
  source_id uuid,
  source_reference text,
  confidence numeric not null default 0 check (confidence between 0 and 1),
  public_disclosure_allowed boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, fact_key)
);

create table if not exists public.data_room_ai_queries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  buyer_id uuid references public.data_room_buyers(id) on delete set null,
  asked_by uuid references public.profiles(id) on delete set null,
  question text not null,
  answer text,
  allowed_file_ids uuid[] not null default '{}',
  cited_file_ids uuid[] not null default '{}',
  redactions_applied jsonb not null default '[]'::jsonb,
  blocked_reason text,
  model_provider text,
  model_name text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_edges (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  from_profile_id uuid references public.profiles(id) on delete cascade,
  contact_type text not null,
  contact_id uuid,
  contact_email_hash text,
  relationship_strength integer not null default 0 check (relationship_strength between 0 and 100),
  last_interaction_at timestamptz,
  interaction_count integer not null default 0,
  introduction_allowed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.buyer_engagement_scores (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_lead_id uuid references public.buyer_leads(id) on delete cascade,
  data_room_buyer_id uuid references public.data_room_buyers(id) on delete set null,
  fit_score integer not null default 0 check (fit_score between 0 and 100),
  engagement_score integer not null default 0 check (engagement_score between 0 and 100),
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  closing_probability integer not null default 0 check (closing_probability between 0 and 100),
  signals jsonb not null default '{}'::jsonb,
  recommended_action text,
  last_scored_at timestamptz,
  unique (listing_id, buyer_lead_id)
);

create table if not exists public.deal_offers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  buyer_lead_id uuid references public.buyer_leads(id) on delete set null,
  status text not null default 'draft',
  purchase_price numeric,
  cash_at_closing numeric,
  seller_note numeric,
  earnout_amount numeric,
  working_capital_adjustment numeric,
  financing_contingency boolean not null default false,
  diligence_days integer,
  training_days integer,
  closing_probability integer not null default 0 check (closing_probability between 0 and 100),
  seller_value_score integer not null default 0 check (seller_value_score between 0 and 100),
  terms jsonb not null default '{}'::jsonb,
  ai_analysis jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.value_growth_plans (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  seller_lead_id uuid references public.seller_leads(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  baseline_value numeric,
  target_value numeric,
  target_exit_date date,
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  owner_dependence_score integer not null default 0 check (owner_dependence_score between 0 and 100),
  concentration_score integer not null default 0 check (concentration_score between 0 and 100),
  action_plan jsonb not null default '[]'::jsonb,
  milestone_history jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exchange_partnerships (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  partner_agency_id uuid not null references public.agencies(id) on delete cascade,
  status text not null default 'pending',
  share_buyers boolean not null default false,
  share_listings boolean not null default false,
  default_referral_fee numeric,
  default_commission_split numeric,
  agreement_reference text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agency_id, partner_agency_id)
);

create table if not exists public.exchange_opportunities (
  id uuid primary key default gen_random_uuid(),
  origin_agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  buyer_lead_id uuid references public.buyer_leads(id) on delete cascade,
  opportunity_type text not null,
  anonymous_summary jsonb not null default '{}'::jsonb,
  permitted_partner_ids uuid[] not null default '{}',
  disclosure_stage text not null default 'anonymous',
  status text not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transition_plans (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  start_date date,
  target_completion_date date,
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  milestones jsonb not null default '[]'::jsonb,
  earnout_tracking jsonb not null default '{}'::jsonb,
  working_capital_checks jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id)
);

create table if not exists public.agent_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  listing_quality_score integer not null default 0,
  response_time_score integer not null default 0,
  compliance_score integer not null default 0,
  training_score integer not null default 0,
  client_satisfaction_score integer not null default 0,
  revenue_generated numeric not null default 0,
  listings_approved integer not null default 0,
  deals_closed integer not null default 0,
  coaching_plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, period_start, period_end)
);

create table if not exists public.trust_center_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  confidentiality_statement text,
  security_summary text,
  ai_use_policy text,
  accessibility_statement text,
  complaint_process text,
  copyright_notice text,
  dmca_contact text,
  license_disclosures jsonb not null default '[]'::jsonb,
  incident_contact text,
  published boolean not null default false,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists deal_fact_evidence_listing_idx on public.deal_fact_evidence (listing_id, verification_level);
create index if not exists data_room_ai_queries_room_idx on public.data_room_ai_queries (data_room_id, created_at desc);
create index if not exists buyer_engagement_listing_idx on public.buyer_engagement_scores (listing_id, engagement_score desc);
create index if not exists deal_offers_listing_idx on public.deal_offers (listing_id, status, seller_value_score desc);
create index if not exists exchange_opportunities_status_idx on public.exchange_opportunities (status, expires_at);

alter table public.deal_passports enable row level security;
alter table public.deal_fact_evidence enable row level security;
alter table public.data_room_ai_queries enable row level security;
alter table public.relationship_edges enable row level security;
alter table public.buyer_engagement_scores enable row level security;
alter table public.deal_offers enable row level security;
alter table public.value_growth_plans enable row level security;
alter table public.exchange_partnerships enable row level security;
alter table public.exchange_opportunities enable row level security;
alter table public.transition_plans enable row level security;
alter table public.agent_performance_snapshots enable row level security;
alter table public.trust_center_settings enable row level security;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'deal_passports','deal_fact_evidence','data_room_ai_queries','relationship_edges',
    'buyer_engagement_scores','deal_offers','value_growth_plans','exchange_partnerships',
    'transition_plans','agent_performance_snapshots','trust_center_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', target_table || '_agency_access', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))',
      target_table || '_agency_access', target_table
    );
  end loop;
end $$;

drop policy if exists exchange_opportunities_origin_access on public.exchange_opportunities;
create policy exchange_opportunities_origin_access on public.exchange_opportunities
  for all to authenticated
  using (public.is_agency_member(origin_agency_id))
  with check (public.is_agency_member(origin_agency_id));

revoke all on public.deal_passports, public.deal_fact_evidence,
  public.data_room_ai_queries, public.relationship_edges,
  public.buyer_engagement_scores, public.deal_offers,
  public.value_growth_plans, public.exchange_partnerships,
  public.exchange_opportunities, public.transition_plans,
  public.agent_performance_snapshots, public.trust_center_settings from anon;

revoke truncate, references, trigger on public.deal_passports,
  public.deal_fact_evidence, public.data_room_ai_queries,
  public.relationship_edges, public.buyer_engagement_scores,
  public.deal_offers, public.value_growth_plans,
  public.exchange_partnerships, public.exchange_opportunities,
  public.transition_plans, public.agent_performance_snapshots,
  public.trust_center_settings from authenticated;

grant select, insert, update, delete on public.deal_passports,
  public.deal_fact_evidence, public.data_room_ai_queries,
  public.relationship_edges, public.buyer_engagement_scores,
  public.deal_offers, public.value_growth_plans,
  public.exchange_partnerships, public.exchange_opportunities,
  public.transition_plans, public.agent_performance_snapshots,
  public.trust_center_settings to authenticated;

commit;
