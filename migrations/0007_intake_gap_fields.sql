-- =============================================================================
-- 0007_intake_gap_fields.sql
-- -----------------------------------------------------------------------------
-- Intake-gap fix (Stage 0): the AI intake interview / extractor never asked
-- about franchise agreements, pending litigation, environmental issues, key
-- customer contracts, key supplier contracts, or years at the current
-- location — so the CIM had to fall back to "confirm during diligence" for
-- all of them. These columns let the pipeline actually COLLECT those facts.
-- Additive, idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS franchise_agreements text,
  ADD COLUMN IF NOT EXISTS pending_litigation text,
  ADD COLUMN IF NOT EXISTS environmental_issues text,
  ADD COLUMN IF NOT EXISTS key_customer_contracts text,
  ADD COLUMN IF NOT EXISTS key_supplier_contracts text,
  ADD COLUMN IF NOT EXISTS years_at_location integer;
