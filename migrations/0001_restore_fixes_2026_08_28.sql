-- =============================================================================
-- Post-restore fixes applied to restored project ytcvlvisufxmmzeblmwx
-- (restored from /root/db-backups/concord-20260828T071125Z.dump)
-- 2026-08-28 — these were live-only changes on the old project that the
-- pg_dump did NOT capture (grants/triggers/constraints are schema-level and
-- were lost in the public-schema-only restore path).
-- Idempotent — safe to re-run.
-- =============================================================================

-- 1) Grants for anon/authenticated/service_role (the app's REST roles)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

-- 2) Auth trigger: auto-create profile on new user (lives in auth schema)
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) listings status must allow soft-delete ('deleted') — app soft-deletes
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft','active','approved','rejected','under_contract','sold','pending_sale','under_loi','closed','withdrawn','deleted'));

-- 4) RLS on restored tables (were enabled in old project; dump restore kept RLS
--    flags but these five needed re-enabling + policies)
alter table public.admin_audit_log enable row level security;
alter table public.marketing_products enable row level security;
alter table public.marketing_designs enable row level security;
alter table public.marketing_orders enable row level security;
create table if not exists public.social_analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete cascade not null,
  platform text not null,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  engagement_rate numeric not null default 0,
  collected_at timestamptz not null default now()
);
create index if not exists social_analytics_post_idx on public.social_analytics (post_id);
alter table public.social_analytics enable row level security;

-- 5) Backfill profiles for users created before the trigger existed
insert into public.profiles (id, email, role)
select id, email, 'buyer' from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
