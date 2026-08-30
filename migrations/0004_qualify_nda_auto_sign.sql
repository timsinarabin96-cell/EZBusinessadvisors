-- =============================================================================
-- 0004_qualify_nda_auto_sign.sql
-- -----------------------------------------------------------------------------
-- Buyer Qualification funnel (Qualify → NDA → Auto counter-sign → Archive):
--   1. agencies: store the agency's signing identity ONCE (name, title, typed
--      signature) so every buyer NDA is auto counter-signed with it.
--   2. listing_nda_signatures: record WHO counter-signed + when (audit trail).
--   3. proof_of_funds stays as-is (the "maybe" path).
-- Additive, idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS signing_name text,
  ADD COLUMN IF NOT EXISTS signing_title text,
  ADD COLUMN IF NOT EXISTS signing_signature text;

ALTER TABLE public.listing_nda_signatures
  ADD COLUMN IF NOT EXISTS counter_signed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS counter_signer_name text,
  ADD COLUMN IF NOT EXISTS counter_signer_title text,
  ADD COLUMN IF NOT EXISTS qualification_score integer,
  ADD COLUMN IF NOT EXISTS qualification_decision text;
