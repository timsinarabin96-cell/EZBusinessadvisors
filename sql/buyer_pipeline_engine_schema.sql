-- =============================================================================
-- Buyer Pipeline Engine — schema for the buyer → closing → follow-ups CRM.
-- Adds pipeline stages, stage history (auto-log), NQA responses, heat score,
-- and the consent flag for the competitive board — all agency-scoped.
-- =============================================================================

-- --- 1. buyer_lists: per-deal buyer tracking gets a real pipeline ------------
alter table public.buyer_lists add column if not exists pipeline_stage text not null default 'new'
  check (pipeline_stage in ('new','contacted','nda_sent','nda_signed','qualified','data_room','loi','negotiation','closed','lost'));
alter table public.buyer_lists add column if not exists stage_entered_at timestamptz;
alter table public.buyer_lists add column if not exists heat_score integer not null default 0;
alter table public.buyer_lists add column if not exists buyer_lead_id uuid references public.buyer_leads(id) on delete set null;
alter table public.buyer_lists add column if not exists competitive_consent boolean not null default false;
create index if not exists buyer_lists_pipeline_idx on public.buyer_lists (listing_id, pipeline_stage);

-- --- 2. buyer_pipeline_events: every stage change, auto-logged --------------
create table if not exists public.buyer_pipeline_events (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  listing_id    uuid references public.listings(id) on delete cascade,
  buyer_list_id uuid references public.buyer_lists(id) on delete cascade,
  from_stage    text,
  to_stage      text not null,
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists buyer_pipeline_events_buyer_idx on public.buyer_pipeline_events (buyer_list_id, created_at desc);
create index if not exists buyer_pipeline_events_agency_idx on public.buyer_pipeline_events (agency_id, created_at desc);

alter table public.buyer_pipeline_events enable row level security;
drop policy if exists "bpe_agency_select" on public.buyer_pipeline_events;
create policy "bpe_agency_select" on public.buyer_pipeline_events for select to authenticated using (
  exists (select 1 from public.agency_members am where am.agency_id = buyer_pipeline_events.agency_id and am.profile_id = auth.uid())
);
drop policy if exists "bpe_agency_insert" on public.buyer_pipeline_events;
create policy "bpe_agency_insert" on public.buyer_pipeline_events for insert to authenticated with check (
  exists (select 1 from public.agency_members am where am.agency_id = buyer_pipeline_events.agency_id and am.profile_id = auth.uid())
);
drop policy if exists "bpe_agency_delete" on public.buyer_pipeline_events;
create policy "bpe_agency_delete" on public.buyer_pipeline_events for delete to authenticated using (
  exists (select 1 from public.agency_members am where am.agency_id = buyer_pipeline_events.agency_id and am.profile_id = auth.uid())
);

-- --- 3. buyer_nqa_responses: auto-qualification questionnaire answers ---------
create table if not exists public.buyer_nqa_responses (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  listing_id    uuid references public.listings(id) on delete cascade,
  buyer_list_id uuid references public.buyer_lists(id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb,
  score         integer not null default 0,
  submitted_at  timestamptz not null default now()
);
create index if not exists buyer_nqa_buyer_idx on public.buyer_nqa_responses (buyer_list_id);

alter table public.buyer_nqa_responses enable row level security;
drop policy if exists "bnqa_agency_select" on public.buyer_nqa_responses;
create policy "bnqa_agency_select" on public.buyer_nqa_responses for select to authenticated using (
  exists (select 1 from public.agency_members am where am.agency_id = buyer_nqa_responses.agency_id and am.profile_id = auth.uid())
);
drop policy if exists "bnqa_agency_insert" on public.buyer_nqa_responses;
create policy "bnqa_agency_insert" on public.buyer_nqa_responses for insert to authenticated with check (
  exists (select 1 from public.agency_members am where am.agency_id = buyer_nqa_responses.agency_id and am.profile_id = auth.uid())
);

-- --- 4. listing competitive board consent (seller-approved urgency lever) ----
alter table public.listings add column if not exists competitive_board_enabled boolean not null default false;
alter table public.listings add column if not exists competitive_board_consented_at timestamptz;
