-- =============================================================================
-- 0006_listing_documents_storage_path.sql
-- -----------------------------------------------------------------------------
-- listing_documents rows (NDA archives, legal uploads) previously stored only
-- a file_url — which for PRIVATE-bucket objects was a broken public link
-- ("Bucket not found"). Add storage_path so viewers can resolve a signed URL
-- at view time via /api/listings/documents/signed-url.
-- Additive, idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.listing_documents
  ADD COLUMN IF NOT EXISTS storage_path text;
