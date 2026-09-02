-- =============================================================================
-- broker_profiles_restore_2026_09_02.sql
-- -----------------------------------------------------------------------------
-- Boss report (2026-09-02): the "listing agent" popup/float disappeared on
-- listings belonging to Harbor Acquisitions (38042787-2e10-44cd-980d-da611f2ba5a3)
-- and QA Test Brokerage (f12ac2e8-938e-44f2-b54f-3af5da2be8d5). Root cause:
-- lib/publicListingMeta.ts resolves listings.agent_id -> broker_profiles.profile_id,
-- falling back to the agency's first broker_profiles row -- but neither agency
-- has ANY broker_profiles row, so the float never renders for their listings.
--
-- Fix: seed one broker_profiles row per real agency member (agency_members)
-- so every agency has at least one public-facing broker card. profile_id is
-- set to a REAL member profile (never a synthetic id) so RLS / FK constraints
-- against profiles(id) hold and any future "my broker profile" self-service
-- edit flow works for that person.
--
-- Members chosen (verified via agency_members on 2026-09-02):
--   Harbor Acquisitions (38042787-2e10-44cd-980d-da611f2ba5a3):
--     - 9256c9d3-bc46-4e0f-8fc4-21957522e2f8 "Harbor Principal Broker" (role=broker)
--     - 0acd6e8f-5133-4e67-b459-36072ec9823f "Harbor Broker" (role=broker)
--   QA Test Brokerage (f12ac2e8-938e-44f2-b54f-3af5da2be8d5):
--     - 54d118ad-ca6b-466d-a631-622e33095787 "QA Test Broker" (role=admin, is_owner) —
--       no dedicated broker-role member exists on this test agency, so the
--       owner/admin is used (still a real, existing member profile).
--
-- Idempotent: ON CONFLICT (profile_id) DO NOTHING keeps re-runs safe.
-- =============================================================================

insert into broker_profiles (
  profile_id, agency_id, public_name, phone, email_public, avatar_url, bio, is_public
)
values
  (
    '9256c9d3-bc46-4e0f-8fc4-21957522e2f8',
    '38042787-2e10-44cd-980d-da611f2ba5a3',
    'Harbor Principal Broker',
    null,
    'harbor.broker.principal@tenant.test',
    null,
    'Principal broker at Harbor Acquisitions, helping buyers and sellers close with confidence.',
    true
  ),
  (
    '0acd6e8f-5133-4e67-b459-36072ec9823f',
    '38042787-2e10-44cd-980d-da611f2ba5a3',
    'Harbor Broker',
    null,
    'harbor.broker@tenant.test',
    null,
    'Business broker at Harbor Acquisitions.',
    true
  ),
  (
    '54d118ad-ca6b-466d-a631-622e33095787',
    'f12ac2e8-938e-44f2-b54f-3af5da2be8d5',
    'QA Test Broker',
    null,
    'e2e.qa@concordplatform.dev',
    null,
    'Broker of record for QA Test Brokerage.',
    true
  )
on conflict (profile_id) do nothing;
