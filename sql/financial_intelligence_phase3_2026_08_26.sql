-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- financial_intelligence_phase3_2026_08_26.sql — FIC Phase 3:
-- sellable add-on flag + bank-vs-books verification tracking.
--
--  1. agency_settings.financial_intelligence_enabled — the "$100 add-on" flag.
--     Admin toggles per sold agency; the FIC surfaces (reader, review, ledger,
--     seller portal uploads) are gated on it.
--  2. seller financial uploads land in financial_documents (existing table,
--     listing-scoped) with source='seller' — new column so brokers can see
--     which docs the seller uploaded themselves vs broker-uploaded.
--  3. verification summary column on verified_financials for the auto
--     bank-vs-books check (deposits vs reported revenue red-flag).
-- Idempotent.
-- =============================================================================

begin;

-- 1) Sellable add-on flag (default ON for the platform's own agency; sold
--    agencies get it as an upsell toggle in admin).
alter table public.agency_settings add column if not exists financial_intelligence_enabled boolean not null default true;

-- 2) Source attribution on financial docs (seller self-upload vs broker).
alter table public.financial_documents add column if not exists upload_source text not null default 'broker'; -- broker | seller

-- 3) Bank-vs-books verification result on the verified record.
alter table public.verified_financials add column if not exists verification_detail jsonb;
alter table public.verified_financials add column if not exists verified_revenue_basis text;

commit;
