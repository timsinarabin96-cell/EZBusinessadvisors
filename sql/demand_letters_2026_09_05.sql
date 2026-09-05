-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Demand Letter Studio (additive, idempotent)
-- -----------------------------------------------------------------------------
-- In-app demand-letter drafts for niche seller outreach (gas stations, NEMT,
-- ...). LETTERS ARE DRAFTS ONLY — nothing here sends email. Statuses:
--   draft   -> being composed
--   ready   -> finalized, broker can copy/print/export manually
--   archived-> no longer active
-- Agency-scoped; RLS mirrors email_templates_agency_access.
-- =============================================================================

begin;

create table if not exists public.demand_letters (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  niche         text not null default 'gas_station'
                check (niche in ('gas_station', 'nemt')),
  status        text not null default 'draft'
                check (status in ('draft', 'ready', 'archived')),
  recipient_name text,
  business_name text,
  location      text,
  subject       text,
  body          text not null default '',
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists demand_letters_agency_status_idx
  on public.demand_letters (agency_id, status, created_at desc);

alter table public.demand_letters enable row level security;

do $$
begin
  execute 'drop policy if exists demand_letters_agency_access on public.demand_letters';
  execute 'create policy demand_letters_agency_access on public.demand_letters for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.demand_letters from anon;
revoke truncate, references, trigger on public.demand_letters from authenticated;
grant select, insert, update, delete on public.demand_letters to authenticated;

-- =============================================================================
-- Lead Re-qualification events (advisory only — never emails leads)
-- -----------------------------------------------------------------------------
-- Append-only log of AI/rule re-qualification runs. Tiers + reasons are
-- suggestions surfaced in-app; no lead data is auto-mutated and no outreach
-- is performed. One row per lead per run.
-- =============================================================================

create table if not exists public.lead_qualification_events (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  lead_id       uuid not null,
  lead_kind     text not null check (lead_kind in ('buyer', 'seller')),
  lead_name     text,
  score         integer not null default 0 check (score >= 0 and score <= 100),
  tier          text not null check (tier in ('hot', 'warm', 'cold')),
  reasons       jsonb not null default '[]'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists lead_qualification_events_agency_idx
  on public.lead_qualification_events (agency_id, created_at desc);
create index if not exists lead_qualification_events_lead_idx
  on public.lead_qualification_events (lead_kind, lead_id);

alter table public.lead_qualification_events enable row level security;

do $$
begin
  execute 'drop policy if exists lead_qualification_events_agency_access on public.lead_qualification_events';
  execute 'create policy lead_qualification_events_agency_access on public.lead_qualification_events for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.lead_qualification_events from anon;
revoke truncate, references, trigger on public.lead_qualification_events from authenticated;
grant select, insert, update, delete on public.lead_qualification_events to authenticated;

commit;
