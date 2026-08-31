-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- bov_review_gate_2026_08_31.sql — BOV liability label gate (boss 08-31).
-- -----------------------------------------------------------------------------
-- A document may only title itself "Broker Opinion of Value" when:
--   · bov_versions.status = 'final'  AND
--   · reviewed_by + reviewed_at are recorded (a licensed agent signed off).
-- Everything else (draft, review, agent-untouched, all self-serve paid output)
-- must title itself "AI Valuation Estimate".
--
-- Idempotent. Adds the reviewer trail columns to the existing bov_versions row.
-- =============================================================================

begin;

alter table public.bov_versions add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.bov_versions add column if not exists reviewed_at timestamptz;

-- Hard invariant: 'final' is impossible without a named reviewer + timestamp.
-- Guarded so legacy rows (which predate the gate) are not retroactively blocked,
-- but every new flip to 'final' must carry the reviewer trail.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bov_final_requires_review') then
    alter table public.bov_versions add constraint bov_final_requires_review
      check (status <> 'final' or (reviewed_by is not null and reviewed_at is not null)) not valid;
  end if;
end $$;

commit;
