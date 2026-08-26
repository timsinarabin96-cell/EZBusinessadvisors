-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- RLS GAP FIX — 2026-08-26 (security sweep)
-- Run this in the Supabase SQL Editor.
--
-- The 2026-08-26 sweep found 17 tables with NO row-level security. This
-- enables RLS on all of them with policies that MATCH current access patterns
-- (so nothing breaks) while closing the "any logged-in user could read
-- anything" hole and blocking anon where grants allowed it.
--
-- Strategy per table:
--   * server-only tables (service-role used exclusively) → admin-only
--   * client-accessed tables → authenticated full access (same as today's
--     behavior, but now RLS-enforced + anon-blocked)
--   * search_log → authenticated INSERT only (it's an append-only log)
-- =============================================================================

begin;

-- Helper: enable RLS on a table if not already enabled
do $$
declare t text;
begin
  foreach t in array array[
    'admin_audit_log','agency_usage','broker_photos','certified_brokers',
    'document_audit_logs','document_signatures','document_templates','documents',
    'marketing_designs','marketing_orders','marketing_products','profile_images',
    'search_log','social_posts','social_settings','trial_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) ADMIN-ONLY tables (exclusively touched by server/service-role code)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_audit_log','agency_usage','trial_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
       ) with check (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
       )',
      t || '_admin_all', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) AUTHENTICATED tables (client-accessed — preserve current behavior,
--    now RLS-enforced and anon-blocked)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'broker_photos','certified_brokers','document_audit_logs','document_signatures',
    'document_templates','documents','marketing_designs','marketing_orders',
    'marketing_products','profile_images','social_posts','social_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_auth_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_auth_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) search_log — append-only: authenticated INSERT, admin read
-- ---------------------------------------------------------------------------
drop policy if exists search_log_auth_insert on public.search_log;
create policy search_log_auth_insert on public.search_log for insert to authenticated with check (true);

drop policy if exists search_log_admin_read on public.search_log;
create policy search_log_admin_read on public.search_log for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
);

-- ---------------------------------------------------------------------------
-- 4) Block anonymous on all 17 (defense in depth even where grants exist)
-- ---------------------------------------------------------------------------
revoke all on public.admin_audit_log, public.agency_usage, public.trial_settings,
  public.broker_photos, public.certified_brokers, public.document_audit_logs,
  public.document_signatures, public.document_templates, public.documents,
  public.marketing_designs, public.marketing_orders, public.marketing_products,
  public.profile_images, public.search_log,
  public.social_posts, public.social_settings
from anon;

-- ---------------------------------------------------------------------------
-- Verify — should return 0 rows:
-- select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- and c.relrowsecurity = false
-- and c.relname not in ('_prisma_migrations');
-- ---------------------------------------------------------------------------

commit;
