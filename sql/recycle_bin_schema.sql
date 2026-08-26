-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Document recycle bin (#12576 polish) — additive, idempotent.
-- deal_documents + listing_documents get soft-delete columns so deleted docs
-- go to a recycle bin (restore possible); permanent delete removes the row +
-- storage. data_room_files already has is_deleted.
-- =============================================================================

begin;

alter table public.deal_documents
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.listing_documents
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

create index if not exists deal_documents_recycle_idx
  on public.deal_documents (is_deleted, deleted_at desc);
create index if not exists listing_documents_recycle_idx
  on public.listing_documents (is_deleted, deleted_at desc);

commit;
