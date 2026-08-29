-- Concord Deal Platform — Deal Room upgrade (Phase 1)
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
--
-- One Dropbox-style Deal Room per deal, shared by agent/buyer/seller:
--   * folders carry an access_level (all_parties | buyer_only | seller_only | agent_only)
--   * files carry access_level + uploaded_by_role
--   * role-aware snapshots: agents see everything; portal buyers/sellers see
--     only the folders/files their role is allowed to see
-- Idempotent — safe to run repeatedly.

-- ── Folders: role visibility ────────────────────────────────────────────────
alter table public.data_room_folders
  add column if not exists access_level text not null default 'all_parties';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'data_room_folders_access_level_check'
  ) then
    alter table public.data_room_folders
      add constraint data_room_folders_access_level_check
      check (access_level = any (array['all_parties','buyer_only','seller_only','agent_only']));
  end if;
end $$;

-- ── Files: role visibility + who uploaded ───────────────────────────────────
alter table public.data_room_files
  add column if not exists access_level text not null default 'all_parties',
  add column if not exists uploaded_by_role text not null default 'agent';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'data_room_files_access_level_check'
  ) then
    alter table public.data_room_files
      add constraint data_room_files_access_level_check
      check (access_level = any (array['all_parties','buyer_only','seller_only','agent_only']));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'data_room_files_uploaded_by_role_check'
  ) then
    alter table public.data_room_files
      add constraint data_room_files_uploaded_by_role_check
      check (uploaded_by_role = any (array['agent','buyer','seller']));
  end if;
end $$;

-- ── Standard Due-Diligence folder template (per room) ───────────────────────
-- Seeded by the app on room creation (lib/dataRoomServer.ts DEFAULT_FOLDERS),
-- so no data backfill needed here — but ensure existing rooms get the template
-- if they were created before the upgrade and have no DD folders yet.
do $$
declare
  r record;
  t text;
  icons text[] := array['💰','⚖️','🏭','👥','🏢','🛡️','📄','🧾','💡','📁','🔒'];
  names text[] := array['Financials','Legal','Operations','HR & Employees','Real Estate & Lease','Insurance','Contracts','Tax Returns','Intellectual Property','Other','Internal (Agent Only)'];
  access text[] := array['all_parties','all_parties','all_parties','all_parties','all_parties','all_parties','all_parties','all_parties','all_parties','all_parties','agent_only'];
begin
  for r in select id from public.data_rooms
  loop
    if not exists (select 1 from public.data_room_folders where data_room_id = r.id) then
      for t in 1..array_length(names, 1)
      loop
        insert into public.data_room_folders (data_room_id, name, icon, "order", access_level)
        values (r.id, names[t], icons[t], t - 1, access[t]);
      end loop;
    end if;
  end loop;
end $$;

-- Backfill existing files/folders: default 'all_parties' (already the default
-- at column creation — nothing else needed). RLS already in place.
