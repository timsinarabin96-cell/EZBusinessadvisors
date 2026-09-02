-- =============================================================================
-- Weekly Newspaper v3 — buyer-only inventory digest, audience segmentation.
-- -----------------------------------------------------------------------------
-- Idempotent. Adds audience segmentation to newspaper_subscriptions so the
-- weekly "Concord Weekly" buyer digest can NEVER be sent to sellers, internal
-- staff, or agents. Also drops the old single-column unique-on-email
-- constraint (if present) and replaces it with unique(lower(email), audience)
-- so the same address can independently subscribe as buyer/seller/etc.
-- No lead disclosure changes here — that is a code-level change (see
-- lib/newspaperV3.ts) which stops querying seller_leads/buyer_leads entirely.
-- =============================================================================

-- 1. audience column on subscriptions ----------------------------------------
alter table if exists public.newspaper_subscriptions
  add column if not exists audience text not null default 'buyer';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'newspaper_subscriptions' and constraint_name = 'newspaper_subscriptions_audience_check'
  ) then
    alter table public.newspaper_subscriptions
      add constraint newspaper_subscriptions_audience_check
      check (audience = any (array['buyer','seller','internal','agent']));
  end if;
exception when duplicate_object then null;
end $$;

-- 2. Replace any old single-column unique(email) with unique(lower(email), audience)
do $$
declare
  c record;
begin
  for c in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_name = 'newspaper_subscriptions'
      and tc.constraint_type = 'UNIQUE'
      and kcu.column_name = 'email'
  loop
    execute format('alter table public.newspaper_subscriptions drop constraint if exists %I', c.constraint_name);
  end loop;
end $$;

drop index if exists newspaper_subscriptions_email_idx;
create unique index if not exists newspaper_subscriptions_email_audience_idx
  on public.newspaper_subscriptions (lower(email), audience);

-- 3. token column (should already exist per schema; keep idempotent) --------
alter table if exists public.newspaper_subscriptions
  add column if not exists token text;

-- 4. delivery log audience (optional, for reporting) -------------------------
alter table if exists public.newspaper_delivery_log
  add column if not exists audience text;

-- 5. structured meta on articles (listingId/slug/agent/price/etc.) so the
--    premium renderer can rebuild rich listing cards after a DB round-trip.
alter table if exists public.newspaper_articles
  add column if not exists meta jsonb;

-- No RLS changes: newspaper_subscriptions / newspaper_delivery_log /
-- newspaper_articles are service-role-managed tables already; this migration
-- does not alter existing RLS policies.
