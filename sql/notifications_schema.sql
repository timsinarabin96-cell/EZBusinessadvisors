-- =============================================================================
-- Concord In-App Notifications — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Lightweight notification center: per-agency + per-profile read/unread inbox
-- fed by the platform's workflows (review actions, NDAs, matches, milestones).
-- =============================================================================

begin;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'info',        -- info | review | nda | match | milestone | billing | system
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_agency_idx
  on public.app_notifications (agency_id, created_at desc);
create index if not exists app_notifications_profile_idx
  on public.app_notifications (profile_id, read_at, created_at desc);

alter table public.app_notifications enable row level security;

do $$
begin
  execute 'drop policy if exists app_notifications_agency_access on public.app_notifications';
  execute 'create policy app_notifications_agency_access on public.app_notifications for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.app_notifications from anon;
revoke truncate, references, trigger on public.app_notifications from authenticated;
grant select, insert, update, delete on public.app_notifications to authenticated;

commit;
