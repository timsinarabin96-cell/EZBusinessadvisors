-- =============================================================================
-- Concord Public "Notify Me" Subscriptions — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Public capture: a visitor can leave an email + criteria ("notify me when a
-- business in my industry at my price point goes live") without an account.
-- The row carries an optional agency_id so broker-hosted public marketplaces
-- can scope subscriptions to their own feed. Matching + alerting happens in
-- lib/notifySubscriptions.ts (service-role insert, RLS keeps reads agency-only).
-- =============================================================================

begin;

create table if not exists public.deal_notify_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  email text not null,
  name text,
  criteria jsonb not null default '{}'::jsonb,   -- { industries, max_price, min_sde, ... }
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists deal_notify_subscriptions_agency_email_idx
  on public.deal_notify_subscriptions (agency_id, email);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table. Public inserts happen via
-- the service-role client in lib/notifySubscriptions.ts, so anon needs nothing.
-- ---------------------------------------------------------------------------
alter table public.deal_notify_subscriptions enable row level security;

do $$
begin
  execute 'drop policy if exists deal_notify_subscriptions_agency_access on public.deal_notify_subscriptions';
  execute 'create policy deal_notify_subscriptions_agency_access on public.deal_notify_subscriptions for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.deal_notify_subscriptions from anon;
revoke truncate, references, trigger on public.deal_notify_subscriptions from authenticated;
grant select, insert, update, delete on public.deal_notify_subscriptions to authenticated;

commit;
