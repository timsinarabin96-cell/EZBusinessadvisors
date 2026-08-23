-- =============================================================================
-- Concord Deal Platform — AI Brokerage Operating System foundation
-- Calendar, voice calls, listing intake, Deal Twins, AI actions, approvals.
-- Idempotent. Run in Supabase SQL Editor after the base/agency schema.
-- =============================================================================

begin;

create or replace function public.is_agency_member(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and profile_id = auth.uid()
  );
$$;

create or replace function public.is_agency_admin(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and profile_id = auth.uid()
      and (role = 'admin' or is_owner = true)
  );
$$;

create table if not exists public.calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  provider              text not null check (provider in ('google', 'microsoft', 'calcom', 'other')),
  external_account_id   text,
  display_name          text,
  secret_reference      text,
  status                text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  last_synced_at        timestamptz,
  sync_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (profile_id, provider, external_account_id)
);

comment on column public.calendar_connections.secret_reference is
  'Reference to a token held in a secrets vault; never store OAuth tokens in this table.';

create table if not exists public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  assigned_to           uuid references public.profiles(id) on delete set null,
  created_by            uuid references public.profiles(id) on delete set null,
  listing_id            uuid references public.listings(id) on delete set null,
  deal_id               uuid references public.deals(id) on delete set null,
  seller_lead_id        uuid references public.seller_leads(id) on delete set null,
  title                 text not null,
  appointment_type      text not null default 'general' check (appointment_type in ('listing', 'buyer', 'valuation', 'due_diligence', 'closing', 'general')),
  status                text not null default 'scheduled' check (status in ('tentative', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  timezone              text not null default 'America/New_York',
  location_type         text not null default 'phone' check (location_type in ('phone', 'video', 'office', 'onsite', 'other')),
  location              text,
  attendee_name         text,
  attendee_email        text,
  attendee_phone        text,
  notes                 text,
  source                text not null default 'manual' check (source in ('manual', 'ai_phone', 'portal', 'calendar_sync', 'api')),
  external_event_id     text,
  confirmation_sent_at  timestamptz,
  reminder_sent_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.call_sessions (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  assigned_to           uuid references public.profiles(id) on delete set null,
  appointment_id        uuid references public.appointments(id) on delete set null,
  listing_id            uuid references public.listings(id) on delete set null,
  deal_id               uuid references public.deals(id) on delete set null,
  seller_lead_id        uuid references public.seller_leads(id) on delete set null,
  provider              text not null default 'twilio',
  provider_call_id      text,
  direction             text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  status                text not null default 'queued' check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'transferred', 'voicemail')),
  caller_number         text,
  destination_number    text,
  caller_name           text,
  purpose               text,
  consent_disclosed_at  timestamptz,
  recording_url         text,
  summary               text,
  sentiment             text,
  qualification_score   numeric(5,2),
  started_at            timestamptz,
  ended_at              timestamptz,
  duration_seconds      integer,
  transferred_to        text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, provider_call_id)
);

create table if not exists public.call_transcripts (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  call_session_id       uuid not null references public.call_sessions(id) on delete cascade,
  sequence              integer not null,
  speaker               text not null check (speaker in ('caller', 'assistant', 'broker', 'system')),
  content               text not null,
  confidence            numeric(5,4),
  started_at_ms         integer,
  ended_at_ms           integer,
  created_at            timestamptz not null default now(),
  unique (call_session_id, sequence)
);

create table if not exists public.listing_intakes (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  created_by            uuid references public.profiles(id) on delete set null,
  assigned_to           uuid references public.profiles(id) on delete set null,
  call_session_id       uuid references public.call_sessions(id) on delete set null,
  appointment_id        uuid references public.appointments(id) on delete set null,
  seller_lead_id        uuid references public.seller_leads(id) on delete set null,
  converted_listing_id  uuid references public.listings(id) on delete set null,
  status                text not null default 'draft' check (status in ('draft', 'qualifying', 'qualified', 'needs_review', 'converted', 'closed')),
  business_name         text,
  industry              text,
  location              text,
  years_in_business     integer,
  annual_revenue        numeric,
  sde                    numeric,
  ebitda                 numeric,
  asking_price          numeric,
  employee_count        integer,
  real_estate_included  boolean,
  reason_for_selling    text,
  desired_timeline      text,
  owner_involvement     text,
  seller_name           text,
  seller_email          text,
  seller_phone          text,
  preferred_contact     text,
  answers               jsonb not null default '{}'::jsonb,
  missing_fields        text[] not null default '{}',
  ai_summary            text,
  qualification_score   numeric(5,2),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.deal_twins (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  listing_id            uuid references public.listings(id) on delete cascade,
  deal_id               uuid references public.deals(id) on delete cascade,
  health_score          numeric(5,2),
  closing_probability   numeric(5,2),
  stage                 text,
  summary               text,
  blockers              jsonb not null default '[]'::jsonb,
  risks                 jsonb not null default '[]'::jsonb,
  next_best_actions     jsonb not null default '[]'::jsonb,
  missing_documents     jsonb not null default '[]'::jsonb,
  buyer_signals         jsonb not null default '{}'::jsonb,
  seller_signals        jsonb not null default '{}'::jsonb,
  financial_snapshot    jsonb not null default '{}'::jsonb,
  last_analyzed_at      timestamptz,
  model                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (listing_id is not null or deal_id is not null)
);

create table if not exists public.ai_actions (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  requested_by          uuid references public.profiles(id) on delete set null,
  assigned_to           uuid references public.profiles(id) on delete set null,
  deal_twin_id          uuid references public.deal_twins(id) on delete set null,
  call_session_id       uuid references public.call_sessions(id) on delete set null,
  action_type           text not null,
  title                 text not null,
  description           text,
  risk_level            text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  approval_required     boolean not null default false,
  status                text not null default 'proposed' check (status in ('proposed', 'approved', 'running', 'completed', 'rejected', 'failed', 'cancelled')),
  input                 jsonb not null default '{}'::jsonb,
  output                jsonb not null default '{}'::jsonb,
  error                 text,
  model                 text,
  idempotency_key       text,
  created_at            timestamptz not null default now(),
  approved_at           timestamptz,
  completed_at          timestamptz,
  unique (agency_id, idempotency_key)
);

create table if not exists public.ai_approvals (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  action_id             uuid not null references public.ai_actions(id) on delete cascade,
  requested_from        uuid references public.profiles(id) on delete set null,
  decided_by            uuid references public.profiles(id) on delete set null,
  status                text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decision_note         text,
  expires_at            timestamptz,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz
);

create table if not exists public.ai_prompt_versions (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  name                  text not null,
  purpose               text not null,
  model_role            text not null check (model_role in ('deepseek', 'claude', 'gpt', 'provider_neutral')),
  version               integer not null default 1,
  prompt                text not null,
  tool_policy           jsonb not null default '{}'::jsonb,
  is_active             boolean not null default false,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (agency_id, name, version)
);

create index if not exists appointments_agency_start_idx on public.appointments (agency_id, starts_at);
create index if not exists appointments_assigned_start_idx on public.appointments (assigned_to, starts_at);
create index if not exists call_sessions_agency_created_idx on public.call_sessions (agency_id, created_at desc);
create index if not exists call_transcripts_call_sequence_idx on public.call_transcripts (call_session_id, sequence);
create index if not exists listing_intakes_agency_status_idx on public.listing_intakes (agency_id, status, created_at desc);
create index if not exists deal_twins_agency_health_idx on public.deal_twins (agency_id, health_score);
create unique index if not exists deal_twins_listing_unique_idx on public.deal_twins (agency_id, listing_id) where listing_id is not null and deal_id is null;
create unique index if not exists deal_twins_deal_unique_idx on public.deal_twins (agency_id, deal_id) where deal_id is not null and listing_id is null;
create unique index if not exists deal_twins_listing_deal_unique_idx on public.deal_twins (agency_id, listing_id, deal_id) where listing_id is not null and deal_id is not null;
create index if not exists ai_actions_agency_status_idx on public.ai_actions (agency_id, status, created_at desc);
create index if not exists ai_approvals_pending_idx on public.ai_approvals (agency_id, status, created_at desc);

alter table public.calendar_connections enable row level security;
alter table public.appointments enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.listing_intakes enable row level security;
alter table public.deal_twins enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_prompt_versions enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'calendar_connections', 'appointments', 'call_sessions', 'call_transcripts',
    'listing_intakes', 'deal_twins', 'ai_actions', 'ai_approvals', 'ai_prompt_versions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_agency_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_agency_member(agency_id))', table_name || '_agency_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_agency_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_agency_member(agency_id))', table_name || '_agency_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_agency_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))', table_name || '_agency_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_agency_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_agency_admin(agency_id))', table_name || '_agency_delete', table_name);
  end loop;
end $$;

grant execute on function public.is_agency_member(uuid) to authenticated;
grant execute on function public.is_agency_admin(uuid) to authenticated;
revoke all on
  public.calendar_connections,
  public.appointments,
  public.call_sessions,
  public.call_transcripts,
  public.listing_intakes,
  public.deal_twins,
  public.ai_actions,
  public.ai_approvals,
  public.ai_prompt_versions
from anon;
revoke truncate, references, trigger on
  public.calendar_connections,
  public.appointments,
  public.call_sessions,
  public.call_transcripts,
  public.listing_intakes,
  public.deal_twins,
  public.ai_actions,
  public.ai_approvals,
  public.ai_prompt_versions
from authenticated;
grant select, insert, update, delete on
  public.calendar_connections,
  public.appointments,
  public.call_sessions,
  public.call_transcripts,
  public.listing_intakes,
  public.deal_twins,
  public.ai_actions,
  public.ai_approvals,
  public.ai_prompt_versions
to authenticated;

commit;
