-- ============================================================================
-- Per-agency document templates + AI import (2026-08-29)
-- White-label: each sold CRM owns its legal documents. agency_id NULL =
-- platform default (EZ). Template Library UI lets any agency upload their
-- original agreement/NDA and AI turns it into a fillable template.
-- ============================================================================

alter table public.document_templates
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade;

alter table public.document_templates
  add column if not exists source_filename text;

alter table public.document_templates
  add column if not exists ai_extracted boolean default false;

create index if not exists document_templates_agency_idx
  on public.document_templates (agency_id);
