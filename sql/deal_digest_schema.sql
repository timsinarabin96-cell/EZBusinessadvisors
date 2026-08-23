-- =============================================================================
-- Concord Weekly Deal Digest — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- One row per digest email sent: the recipient, the listing ids included, and
-- when it was generated. Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.deal_digests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  generated_at timestamptz not null default now(),
  recipient_email text not null,
  listing_ids jsonb not null default '[]'::jsonb,
  status text not null default 'sent'
);

create index if not exists deal_digests_agency_created_idx
  on public.deal_digests (agency_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table.
-- ---------------------------------------------------------------------------
alter table public.deal_digests enable row level security;

do $$
begin
  execute 'drop policy if exists deal_digests_agency_access on public.deal_digests';
  execute 'create policy deal_digests_agency_access on public.deal_digests for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.deal_digests from anon;
revoke truncate, references, trigger on public.deal_digests from authenticated;
grant select, insert, update, delete on public.deal_digests to authenticated;

commit;
