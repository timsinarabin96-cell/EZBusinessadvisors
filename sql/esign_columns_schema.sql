-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- ESIGN COLUMNS — 2026-08-26
-- Adds provider signature-request tracking to documents for the eSign module
-- (DocuSign / HelloSign). Run in Supabase SQL Editor.
-- =============================================================================

begin;

alter table public.documents
  add column if not exists esign_provider text,          -- docusign | hellosign
  add column if not exists esign_request_id text,        -- provider envelope/request id
  add column if not exists esign_status text,            -- sent | signed | declined | expired
  add column if not exists esign_sent_at timestamptz,
  add column if not exists esign_completed_at timestamptz;

comment on column public.documents.esign_provider is 'eSign provider (docusign|hellosign) — null when in-app signature pad used';
comment on column public.documents.esign_status is 'sent | signed | declined | expired';

commit;
