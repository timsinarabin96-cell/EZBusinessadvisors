-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- legal_checklist_2026_08_31.sql — #4 configurable legal-doc gate (spec §2A).
--   agency_settings.legal_doc_checklist jsonb  — editable required-docs list.
--   Default: ["marketing_agreement", "llc_resolution"] (spec §1 + §5).
-- The publish gate reads this list; admins edit it per agency. Not hardcoded.
-- =============================================================================

begin;

alter table public.agency_settings add column if not exists legal_doc_checklist jsonb
  not null default '["marketing_agreement", "llc_resolution"]'::jsonb;

commit;
