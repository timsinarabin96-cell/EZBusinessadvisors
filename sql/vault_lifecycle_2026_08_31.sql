-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- vault_lifecycle_2026_08_31.sql — Document vault lifecycle columns (approved
-- schema, boss 08-31). Single source of truth: extends data_room_files; no
-- dual-store. Adds the spec Section 3 fields to the existing room model:
--
--   visibility        internal_only | buyer_visible | seller_only
--                     (maps to existing access_level: buyer_visible→buyer_only,
--                      internal_only→agent_only, seller_only→seller_only)
--   stage_tag         intake | listing_live | due_diligence | closing
--   source            uploaded_by_seller | uploaded_by_agent | uploaded_by_buyer
--                     | generated_by_claude
--   claude_check      pending | verified | flagged  (+ reason)
--
-- Version history (version, parent_id, soft delete) and audit trail
-- (viewed/downloaded counts + view log) already exist — unchanged.
-- Multi-tenant: data_rooms.agency_id NOT NULL already — unchanged.
-- =============================================================================

begin;

-- 1) Vault lifecycle columns on the room file row
alter table public.data_room_files add column if not exists visibility text not null default 'internal_only';
alter table public.data_room_files add column if not exists stage_tag text not null default 'intake';
alter table public.data_room_files add column if not exists source text not null default 'uploaded_by_agent';
alter table public.data_room_files add column if not exists claude_check text not null default 'pending';
alter table public.data_room_files add column if not exists claude_check_reason text;
alter table public.data_room_files add column if not exists archived_at timestamptz;

-- 2) Check constraints (idempotent — drop+re-add so re-runs are safe)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'data_room_files_visibility_check') then
    alter table public.data_room_files add constraint data_room_files_visibility_check
      check (visibility in ('internal_only', 'buyer_visible', 'seller_only'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'data_room_files_stage_tag_check') then
    alter table public.data_room_files add constraint data_room_files_stage_tag_check
      check (stage_tag in ('intake', 'listing_live', 'due_diligence', 'closing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'data_room_files_source_check') then
    alter table public.data_room_files add constraint data_room_files_source_check
      check (source in ('uploaded_by_seller', 'uploaded_by_agent', 'uploaded_by_buyer', 'generated_by_claude'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'data_room_files_claude_check_check') then
    alter table public.data_room_files add constraint data_room_files_claude_check_check
      check (claude_check in ('pending', 'verified', 'flagged'));
  end if;
end $$;

-- 3) Category: legal / financial / due_diligence / buyer_submitted /
--    generated_document. file_kind holds the MIME-level kind; category is a
--    NEW column so the two never collide (file_kind stays pdf/excel/word/...).
alter table public.data_room_files add column if not exists category text not null default 'other';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'data_room_files_category_check') then
    alter table public.data_room_files add constraint data_room_files_category_check
      check (category in ('legal', 'financial', 'due_diligence', 'buyer_submitted', 'generated_document', 'other'));
  end if;
end $$;

-- 4) Indexes for the common filters (visibility gating + stage + source)
create index if not exists data_room_files_visibility_idx on public.data_room_files (data_room_id, visibility, is_deleted);
create index if not exists data_room_files_stage_idx on public.data_room_files (data_room_id, stage_tag);
create index if not exists data_room_files_source_idx on public.data_room_files (data_room_id, source);

commit;
