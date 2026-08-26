-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- SECURITY HARDENING — 2026-08-26
-- Run this in the Supabase SQL Editor.
-- Fixes found in the 2026-08-26 hardening audit:
--   1. 'documents' storage bucket was PUBLIC with a public-read policy.
--      Client portal uploads (contracts, financials) were getting PERMANENT
--      public URLs. Now locked to private; access is via short-lived signed
--      URLs generated server-side (app code already updated).
--   2. 'financial_docs' bucket is double-checked private (already was).
-- NOTE: listing_images + training buckets stay public ON PURPOSE — they hold
-- public marketplace photos and training videos, never client financials.
-- =============================================================================

-- 1) Lock the documents bucket (was public=true)
update storage.buckets
set public = false
where id = 'documents';

-- 2) Drop the public-read policy on storage.objects for documents
drop policy if exists "documents public read" on storage.objects;

-- 3) Belt-and-suspenders: financial_docs must stay private
update storage.buckets
set public = false
where id = 'financial_docs';

-- 4) Verify (should return 0 rows):
-- select id, public from storage.buckets where public = true and id in ('documents','financial_docs');
