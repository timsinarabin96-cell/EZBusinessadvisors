-- =============================================================================
-- Concord Nurture Drips — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- 1) nurture_sequences   — named email sequences per audience (buyer/seller).
--    Each step is a jsonb object { id, day, title } and is sent in order.
-- 2) nurture_recipients  — one row per enrolled contact. A clock (next_send_at)
--    decides when the next step fires; advancing is handled by the lib.
-- Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.nurture_sequences (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  audience text not null default 'buyer' check (audience in ('buyer','seller')),
  steps jsonb not null default '[]'::jsonb,   -- [{ id, day, title }]
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists nurture_sequences_agency_idx
  on public.nurture_sequences (agency_id, active, created_at desc);

create table if not exists public.nurture_recipients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  sequence_id uuid not null references public.nurture_sequences(id) on delete cascade,
  email text not null,
  lead_type text default 'buyer',
  current_step integer not null default 0,
  next_send_at timestamptz,
  status text not null default 'active' check (status in ('active','completed','paused')),
  created_at timestamptz not null default now()
);

create index if not exists nurture_recipients_agency_status_idx
  on public.nurture_recipients (agency_id, status, created_at desc);
create index if not exists nurture_recipients_due_idx
  on public.nurture_recipients (sequence_id, next_send_at);

alter table public.nurture_sequences enable row level security;
alter table public.nurture_recipients enable row level security;

do $$
begin
  execute 'drop policy if exists nurture_sequences_agency_access on public.nurture_sequences';
  execute 'create policy nurture_sequences_agency_access on public.nurture_sequences for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
  execute 'drop policy if exists nurture_recipients_agency_access on public.nurture_recipients';
  execute 'create policy nurture_recipients_agency_access on public.nurture_recipients for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.nurture_sequences from anon;
revoke all on public.nurture_recipients from anon;
revoke truncate, references, trigger on public.nurture_sequences from authenticated;
revoke truncate, references, trigger on public.nurture_recipients from authenticated;
grant select, insert, update, delete on public.nurture_sequences to authenticated;
grant select, insert, update, delete on public.nurture_recipients to authenticated;

commit;
