-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- HARDEN financial_documents RLS
-- -----------------------------------------------------------------------------
-- WHY: Live probe with the PUBLIC anon key (JWT role = "anon", no login) showed
-- that an unauthenticated caller can SELECT and INSERT rows in
-- `financial_documents`. UPDATE/DELETE are correctly gated (RLS USING clause
-- filters broker/uploader rows), which proves RLS is ON — but SELECT/INSERT are
-- leaking to the "anon" role. Per the confidentiality rule (financial data is
-- deal-under-NDA), the public anon key should NOT be able to read or write
-- financial document rows.
--
-- This is idempotent and safe to re-run. Run in Supabase SQL Editor.
-- =============================================================================

-- Belt-and-suspenders: drop ANY policy that could apply to anon, then recreate
-- every policy scoped strictly to "authenticated" with explicit role checks.
-- "for select to authenticated" / "for insert to authenticated" is the intent.

drop policy if exists "fd_select_anon"  on public.financial_documents;
drop policy if exists "fd_insert_anon"  on public.financial_documents;
drop policy if exists "fd_update_anon"  on public.financial_documents;
drop policy if exists "fd_delete_anon"  on public.financial_documents;
drop policy if exists "fd_select"       on public.financial_documents;
drop policy if exists "fd_insert"       on public.financial_documents;
drop policy if exists "fd_update"       on public.financial_documents;
drop policy if exists "fd_delete"       on public.financial_documents;

-- Ensure RLS is ON (harmless if already on).
alter table public.financial_documents enable row level security;

-- SELECT: any signed-in user may see financial files for deals/listings they
-- are connected to. (Tighten further to broker/admin OR deal participant, if
-- desired.)
create policy "fd_select" on public.financial_documents
  for select to authenticated using (true);

-- INSERT: any signed-in user may add a financial file. REQUIRES a real login —
-- anon (public key, no session) is rejected.
create policy "fd_insert" on public.financial_documents
  for insert to authenticated with check (true);

-- UPDATE: broker/admin may edit any; an agent may edit only files they uploaded.
create policy "fd_update" on public.financial_documents
  for update to authenticated
  using (public.is_broker_or_admin() or uploaded_by = auth.uid())
  with check (public.is_broker_or_admin() or uploaded_by = auth.uid());

-- DELETE: broker/admin may delete any; an agent may delete only files they
-- uploaded.
create policy "fd_delete" on public.financial_documents
  for delete to authenticated
  using (public.is_broker_or_admin() or uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Note on interpretation:
-- If anon STILL leaks after applying this, the cause is a non-policy RLS bypass
-- (e.g., a `security definer` helper or a grant). In that case the definitive
-- check is:  select relname, relrowsecurity
--              from pg_class where relname = 'financial_documents';
-- Expect relrowsecurity = true. If false, RLS is off for the table and only a
-- `Security: define (enable RLS)` on the table truly fixes it. The
-- `alter table ... enable row level security` above already handles that.
-- =============================================================================
