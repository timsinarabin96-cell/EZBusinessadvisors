-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- FIX appointments.source check constraint (2026-08-27)
-- -----------------------------------------------------------------------------
-- The constraint only allowed ('manual','ai_phone','portal','calendar_sync','api')
-- but the app also writes 'ai_chat', 'public_book', and 'ai_booking'. That made
-- the public booking page, the AI chat booking, and the natural-language booking
-- API all fail with "appointments_source_check" violations.
--
-- Safe: widen the allow-list; existing rows untouched. Idempotent.
-- =============================================================================

alter table public.appointments drop constraint if exists appointments_source_check;

alter table public.appointments add constraint appointments_source_check
  check (source in ('manual', 'ai_phone', 'portal', 'calendar_sync', 'api', 'ai_chat', 'public_book', 'ai_booking'));
