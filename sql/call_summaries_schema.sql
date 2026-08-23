-- =============================================================================
-- Concord AI Call Summaries — per-call AI summary rows (additive, idempotent)
-- -----------------------------------------------------------------------------
-- call_summaries — one row per voice call session (call_sessions). Stores the
-- transcript excerpt, a generated summary, extracted action items, and the
-- sentiment + model used. Unique call_id so re-summarizing upserts in place.
-- =============================================================================

begin;

create table if not exists public.call_summaries (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  call_id            uuid references public.call_sessions(id) on delete cascade,
  transcript_excerpt text,
  summary            text not null,
  action_items       jsonb not null default '[]'::jsonb,
  sentiment          text,
  model              text,
  created_at         timestamptz not null default now(),
  unique (call_id)
);

create index if not exists call_summaries_agency_idx
  on public.call_summaries (agency_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.call_summaries enable row level security;

do $$
begin
  execute 'drop policy if exists call_summaries_agency_access on public.call_summaries';
  execute 'create policy call_summaries_agency_access on public.call_summaries for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.call_summaries from anon;
revoke truncate, references, trigger on public.call_summaries from authenticated;
grant select, insert, update, delete on public.call_summaries to authenticated;

commit;
