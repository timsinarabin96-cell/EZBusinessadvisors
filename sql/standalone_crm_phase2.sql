-- =============================================================================
-- Standalone CRM + Reseller — Phase 2 migration
-- Product-type flag on agencies + white-label + CRM plan limits.
-- Run via: .migration/run_sql.sh "$(cat sql/standalone_crm_phase2.sql)"
-- =============================================================================

-- 1) Product type: marketplace (full platform) | crm_standalone (CRM only)
--    | crm_reseller (white-label CRM pod). Default = marketplace so existing
--    tenants are unaffected.
alter table public.agencies
  add column if not exists product_type text not null default 'marketplace';

alter table public.agencies
  drop constraint if exists agencies_product_type_check;
alter table public.agencies
  add constraint agencies_product_type_check
  check (product_type in ('marketplace', 'crm_standalone', 'crm_reseller'));

-- 2) White-label flag (reseller pods).
alter table public.agencies
  add column if not exists is_white_label boolean not null default false;

-- 3) CRM plan metadata on the agency (solo/team/agency) + seat ceiling.
alter table public.agencies
  add column if not exists crm_plan text;
alter table public.agencies
  add column if not exists crm_seat_limit int not null default 1;
alter table public.agencies
  add column if not exists crm_client_limit int not null default 50;
alter table public.agencies
  add column if not exists crm_ai_credit_limit int not null default 100;

-- 4) Subdomain for reseller pods (e.g. acme.crm.concordplatform.com).
alter table public.agencies
  add column if not exists subdomain text unique;

-- 5) Per-agency usage counters (for the 90% alert cron — Phase 1.5).
alter table public.agency_settings
  add column if not exists ai_credits_used int not null default 0;
alter table public.agency_settings
  add column if not exists storage_bytes bigint not null default 0;

-- 6) Helpful indexes.
create index if not exists agencies_product_type_idx on public.agencies (product_type);
create index if not exists agencies_subdomain_idx on public.agencies (subdomain);
