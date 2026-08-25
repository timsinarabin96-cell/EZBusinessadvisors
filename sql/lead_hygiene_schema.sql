-- =============================================================================
-- Lead Hygiene — duplicate detection + source tracking support.
-- Idempotent; safe to re-run.
--   1. seller_leads gets a `source` column (buyer_leads already has one).
--   2. lead_activities gets an index on lead_id (merge moves rows by lead_id).
-- =============================================================================

alter table public.seller_leads
  add column if not exists source text;

alter table public.buyer_leads
  add column if not exists source text;

create index if not exists lead_activities_lead_id_idx
  on public.lead_activities (lead_id);
