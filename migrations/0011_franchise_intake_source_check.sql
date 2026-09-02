-- =============================================================================
-- 0011_franchise_intake_source_check.sql
-- -----------------------------------------------------------------------------
-- Live sanity check (2026-09-02) caught it: franchise listings are created
-- with intake_source='franchise_self_service', but the listings
-- intake_source CHECK constraint only allowed broker_manual /
-- seller_self_service / ai_phone / import — so the franchise intake API
-- failed at insert with "violates check constraint". Relax the constraint.
-- Additive, idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_intake_source_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_intake_source_check
  CHECK (
    intake_source = ANY (ARRAY[
      'broker_manual'::text,
      'seller_self_service'::text,
      'ai_phone'::text,
      'import'::text,
      'franchise_self_service'::text
    ])
  );
