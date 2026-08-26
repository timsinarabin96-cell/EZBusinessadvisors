-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Data Room Q&A — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- AI-assisted questions about a deal's data room. Brokers ask natural-language
-- questions ("do we have the last 3 years of tax returns?") and the engine
-- answers from the data room file index (file_name / notes / file_kind),
-- optionally polished by the DeepSeek client with a deterministic fallback.
-- =============================================================================

begin;

create table if not exists public.data_room_qa (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  question     text not null,
  answer       text,
  status       text not null default 'pending' check (status in ('pending', 'answered', 'failed')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);

create index if not exists data_room_qa_agency_idx
  on public.data_room_qa (agency_id, created_at desc);
create index if not exists data_room_qa_room_idx
  on public.data_room_qa (data_room_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.data_room_qa enable row level security;

do $$
begin
  execute 'drop policy if exists data_room_qa_agency_access on public.data_room_qa';
  execute 'create policy data_room_qa_agency_access on public.data_room_qa for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.data_room_qa from anon;
revoke truncate, references, trigger on public.data_room_qa from authenticated;
grant select, insert, update, delete on public.data_room_qa to authenticated;

commit;
