-- =============================================================================
-- Concord Deal Twin — per-listing health snapshot (additive, idempotent)
-- -----------------------------------------------------------------------------
-- deal_twin_snapshots — a computed 0-100 health score for a listing with a
-- component breakdown (data room, buyers, offers, closing milestones,
-- momentum), risk flags, and a one-line summary. One row per listing; POSTing
-- a recompute upserts in place (unique listing_id).
-- =============================================================================

begin;

create table if not exists public.deal_twin_snapshots (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  deal_id       uuid references public.deals(id) on delete set null,
  health_score  integer not null default 0,
  risk_flags    jsonb not null default '[]'::jsonb,
  components    jsonb not null default '{}'::jsonb,   -- { dataRoom, buyers, offers, milestones, momentum }
  summary       text,
  computed_at   timestamptz not null default now(),
  unique (listing_id)
);

create index if not exists deal_twin_agency_idx
  on public.deal_twin_snapshots (agency_id, computed_at desc);
create index if not exists deal_twin_score_idx
  on public.deal_twin_snapshots (health_score desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.deal_twin_snapshots enable row level security;

do $$
begin
  execute 'drop policy if exists deal_twin_snapshots_agency_access on public.deal_twin_snapshots';
  execute 'create policy deal_twin_snapshots_agency_access on public.deal_twin_snapshots for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.deal_twin_snapshots from anon;
revoke truncate, references, trigger on public.deal_twin_snapshots from authenticated;
grant select, insert, update, delete on public.deal_twin_snapshots to authenticated;

commit;
