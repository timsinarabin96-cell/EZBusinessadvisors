-- =============================================================================
-- Concord Agency Security — require-2FA policy (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Owner/admin can require two-factor authentication for all agency brokers via
-- the /api/agency/security endpoint and the Security dashboard page.
-- =============================================================================

begin;

alter table public.agencies add column if not exists require_2fa boolean not null default false;

commit;
