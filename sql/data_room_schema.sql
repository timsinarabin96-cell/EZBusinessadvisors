-- =============================================================================
-- CONCORD DEAL PLATFORM — Deal Data Room Schema (2026-08-03)
-- =============================================================================
-- Dropbox-style Virtual Data Room with auto-save, real-time updates, version
-- history, multi-buyer sharing, per-buyer permission roles, activity feed,
-- view/download tracking, and a 30-day recycle bin.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor → paste → Run
-- Idempotent + safe to re-run. Preserves existing data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. data_rooms — the top-level virtual data room (one per deal)
-- ---------------------------------------------------------------------------
create table if not exists public.data_rooms (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references public.deals(id) on delete cascade,
  listing_id  uuid references public.listings(id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'active',   -- active | archived
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. data_room_folders — hierarchical folder tree
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_folders (
  id              uuid primary key default gen_random_uuid(),
  data_room_id    uuid not null references public.data_rooms(id) on delete cascade,
  parent_folder_id uuid references public.data_room_folders(id) on delete cascade,
  name            text not null,
  icon            text,
  "order"         integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists dr_folders_room_idx on public.data_room_folders (data_room_id);
create index if not exists dr_folders_parent_idx on public.data_room_folders (parent_folder_id);

-- ---------------------------------------------------------------------------
-- 3. data_room_files — files with version history + soft-delete
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_files (
  id              uuid primary key default gen_random_uuid(),
  data_room_id    uuid not null references public.data_rooms(id) on delete cascade,
  folder_id       uuid references public.data_room_folders(id) on delete set null,
  file_name       text not null,
  file_url        text not null,
  storage_path    text,
  file_type       text,                          -- mime type
  file_size       bigint,
  file_kind       text default 'other',           -- pdf | excel | word | image | other
  uploaded_by     uuid references public.profiles(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  version         integer not null default 1,
  notes           text,
  is_deleted      boolean not null default false,
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles(id) on delete set null,
  viewed_count    integer not null default 0,
  downloaded_count integer not null default 0,
  parent_id       uuid,                          -- previous version pointer
  updated_at      timestamptz not null default now()
);
create index if not exists dr_files_room_idx on public.data_room_files (data_room_id);
create index if not exists dr_files_folder_idx on public.data_room_files (folder_id);
create index if not exists dr_files_deleted_idx on public.data_room_files (is_deleted);

-- ---------------------------------------------------------------------------
-- 4. data_room_shares — share records (email + link) with per-buyer role/expiry
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_shares (
  id           uuid primary key default gen_random_uuid(),
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  shared_by    uuid references public.profiles(id) on delete set null,
  share_type   text not null default 'email',    -- email | link
  shared_with  text,                             -- email address (nullable for link)
  role         text not null default 'viewer',   -- owner | editor | viewer | uploader | commenter
  permissions  jsonb,                            -- granular capabilities object
  message      text,
  expires_at   timestamptz,
  status       text not null default 'pending',  -- pending | accepted | revoked | expired
  created_at   timestamptz not null default now()
);
create index if not exists dr_shares_room_idx on public.data_room_shares (data_room_id);
create index if not exists dr_shares_email_idx on public.data_room_shares (shared_with);

-- ---------------------------------------------------------------------------
-- 5. data_room_buyers — tracked buyers with per-buyer access + activity
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_buyers (
  id             uuid primary key default gen_random_uuid(),
  data_room_id   uuid not null references public.data_rooms(id) on delete cascade,
  buyer_email    text not null,
  buyer_name     text,
  role           text not null default 'viewer',
  invited_by     uuid references public.profiles(id) on delete set null,
  invited_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  last_accessed  timestamptz,
  status         text not null default 'invited', -- invited | active | revoked | expired
  unique (data_room_id, buyer_email)
);
create index if not exists dr_buyers_room_idx on public.data_room_buyers (data_room_id);

-- ---------------------------------------------------------------------------
-- 6. data_room_activities — live activity feed
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_activities (
  id          uuid primary key default gen_random_uuid(),
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  user_email  text,
  action      text not null,                     -- uploaded | deleted | restored | shared | buyer_joined | revoked | viewed | downloaded | renamed | moved | commented
  details     text,
  created_at  timestamptz not null default now()
);
create index if not exists dr_activities_room_idx on public.data_room_activities (data_room_id);
create index if not exists dr_activities_created_idx on public.data_room_activities (created_at desc);

-- ---------------------------------------------------------------------------
-- 7. data_room_comments — file comments
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_comments (
  id         uuid primary key default gen_random_uuid(),
  file_id    uuid not null references public.data_room_files(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  comment    text not null,
  created_at timestamptz not null default now()
);
create index if not exists dr_comments_file_idx on public.data_room_comments (file_id);

-- ---------------------------------------------------------------------------
-- 8. data_room_trash — recycle bin (30-day auto-cleanup handled at app level)
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_trash (
  id             uuid primary key default gen_random_uuid(),
  original_table text not null,
  original_id    uuid not null,
  file_name      text,
  file_url       text,
  storage_path   text,
  file_kind      text,
  deleted_by     uuid references public.profiles(id) on delete set null,
  deleted_at     timestamptz not null default now(),
  restored_at    timestamptz,
  restored_by    uuid references public.profiles(id) on delete set null
);
create index if not exists dr_trash_deleted_idx on public.data_room_trash (deleted_at);

-- ---------------------------------------------------------------------------
-- 9. data_room_view_logs — track which buyer viewed what
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_view_logs (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid not null references public.data_room_files(id) on delete cascade,
  viewer_email text,
  viewed_at    timestamptz not null default now(),
  ip_address   text,
  user_agent   text
);
create index if not exists dr_viewlogs_file_idx on public.data_room_view_logs (file_id);
create index if not exists dr_viewlogs_email_idx on public.data_room_view_logs (viewer_email);

-- ---------------------------------------------------------------------------
-- 10. data_room_download_logs — track which buyer downloaded what
-- ---------------------------------------------------------------------------
create table if not exists public.data_room_download_logs (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references public.data_room_files(id) on delete cascade,
  downloader_email text,
  downloaded_at   timestamptz not null default now(),
  ip_address      text
);
create index if not exists dr_dl_file_idx on public.data_room_download_logs (file_id);

-- ---------------------------------------------------------------------------
-- Helper: broker or admin? (used by RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_broker_or_admin()
returns boolean
language sql stable security definer
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'agent'
  ) in ('broker', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- RLS — enable + permissive-for-team policies (broker firm apps are internal;
-- buyer access is gated at the app/API layer via share tokens + roles).
-- ---------------------------------------------------------------------------
alter table public.data_rooms enable row level security;
alter table public.data_room_folders enable row level security;
alter table public.data_room_files enable row level security;
alter table public.data_room_shares enable row level security;
alter table public.data_room_buyers enable row level security;
alter table public.data_room_activities enable row level security;
alter table public.data_room_comments enable row level security;
alter table public.data_room_trash enable row level security;
alter table public.data_room_view_logs enable row level security;
alter table public.data_room_download_logs enable row level security;

-- data_rooms: any authenticated user can read/create; update/delete broker/admin
drop policy if exists "dr_select" on public.data_rooms;
create policy "dr_select" on public.data_rooms for select to authenticated using (true);
drop policy if exists "dr_insert" on public.data_rooms;
create policy "dr_insert" on public.data_rooms for insert to authenticated with check (true);
drop policy if exists "dr_update" on public.data_rooms;
create policy "dr_update" on public.data_rooms for update to authenticated using (public.is_broker_or_admin());
drop policy if exists "dr_delete" on public.data_rooms;
create policy "dr_delete" on public.data_rooms for delete to authenticated using (public.is_broker_or_admin());

-- folders: authenticated read/write; delete broker/admin only
drop policy if exists "drf_select" on public.data_room_folders;
create policy "drf_select" on public.data_room_folders for select to authenticated using (true);
drop policy if exists "drf_insert" on public.data_room_folders;
create policy "drf_insert" on public.data_room_folders for insert to authenticated with check (true);
drop policy if exists "drf_update" on public.data_room_folders;
create policy "drf_update" on public.data_room_folders for update to authenticated using (true);
drop policy if exists "drf_delete" on public.data_room_folders;
create policy "drf_delete" on public.data_room_folders for delete to authenticated using (public.is_broker_or_admin());

-- files: authenticated read/write; delete/create-version broker/admin (uploader may soft-delete own)
drop policy if exists "drfiles_select" on public.data_room_files;
create policy "drfiles_select" on public.data_room_files for select to authenticated using (true);
drop policy if exists "drfiles_insert" on public.data_room_files;
create policy "drfiles_insert" on public.data_room_files for insert to authenticated with check (true);
drop policy if exists "drfiles_update" on public.data_room_files;
create policy "drfiles_update" on public.data_room_files for update to authenticated using (true);
drop policy if exists "drfiles_delete" on public.data_room_files;
create policy "drfiles_delete" on public.data_room_files for delete to authenticated using (public.is_broker_or_admin() or uploaded_by = auth.uid());

-- shares: authenticated read/write/delete (broker-centric)
drop policy if exists "drs_select" on public.data_room_shares;
create policy "drs_select" on public.data_room_shares for select to authenticated using (true);
drop policy if exists "drs_insert" on public.data_room_shares;
create policy "drs_insert" on public.data_room_shares for insert to authenticated with check (true);
drop policy if exists "drs_update" on public.data_room_shares;
create policy "drs_update" on public.data_room_shares for update to authenticated using (true);
drop policy if exists "drs_delete" on public.data_room_shares;
create policy "drs_delete" on public.data_room_shares for delete to authenticated using (true);

-- buyers: authenticated read/write/delete
drop policy if exists "drb_select" on public.data_room_buyers;
create policy "drb_select" on public.data_room_buyers for select to authenticated using (true);
drop policy if exists "drb_insert" on public.data_room_buyers;
create policy "drb_insert" on public.data_room_buyers for insert to authenticated with check (true);
drop policy if exists "drb_update" on public.data_room_buyers;
create policy "drb_update" on public.data_room_buyers for update to authenticated using (true);
drop policy if exists "drb_delete" on public.data_room_buyers;
create policy "drb_delete" on public.data_room_buyers for delete to authenticated using (true);

-- activities: authenticated read/write
drop policy if exists "dra_select" on public.data_room_activities;
create policy "dra_select" on public.data_room_activities for select to authenticated using (true);
drop policy if exists "dra_insert" on public.data_room_activities;
create policy "dra_insert" on public.data_room_activities for insert to authenticated with check (true);

-- comments: authenticated read/write
drop policy if exists "drc_select" on public.data_room_comments;
create policy "drc_select" on public.data_room_comments for select to authenticated using (true);
drop policy if exists "drc_insert" on public.data_room_comments;
create policy "drc_insert" on public.data_room_comments for insert to authenticated with check (true);
drop policy if exists "drc_delete" on public.data_room_comments;
create policy "drc_delete" on public.data_room_comments for delete to authenticated using (true);

-- trash: authenticated read; delete broker/admin only
drop policy if exists "drt_select" on public.data_room_trash;
create policy "drt_select" on public.data_room_trash for select to authenticated using (true);
drop policy if exists "drt_insert" on public.data_room_trash;
create policy "drt_insert" on public.data_room_trash for insert to authenticated with check (true);
drop policy if exists "drt_update" on public.data_room_trash;
create policy "drt_update" on public.data_room_trash for update to authenticated using (true);
drop policy if exists "drt_delete" on public.data_room_trash;
create policy "drt_delete" on public.data_room_trash for delete to authenticated using (public.is_broker_or_admin());

-- view logs: authenticated read/write
drop policy if exists "drv_select" on public.data_room_view_logs;
create policy "drv_select" on public.data_room_view_logs for select to authenticated using (true);
drop policy if exists "drv_insert" on public.data_room_view_logs;
create policy "drv_insert" on public.data_room_view_logs for insert to authenticated with check (true);

-- download logs: authenticated read/write
drop policy if exists "drdl_select" on public.data_room_download_logs;
create policy "drdl_select" on public.data_room_download_logs for select to authenticated using (true);
drop policy if exists "drdl_insert" on public.data_room_download_logs;
create policy "drdl_insert" on public.data_room_download_logs for insert to authenticated with check (true);

-- Helper grants
grant execute on function public.is_broker_or_admin() to authenticated;

-- =============================================================================
-- DONE. After running, refresh the PostgREST schema cache if any table still
-- reports "Could not find the table" (Supabase sometimes caches).
-- =============================================================================
