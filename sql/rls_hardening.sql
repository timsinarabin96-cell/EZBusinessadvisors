-- Concord Deal Platform — RLS hardening (security sweep 2026-08-29)
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
--
-- Found in sweep: several tables allowed ANY authenticated user to read/insert
-- everything (USING true). Tighten to agency/owner scoping like listings.
-- Service-role API paths bypass RLS, so the app keeps working; only direct
-- client (browser session) access is now properly scoped.
-- Idempotent.

-- ── financial_documents: any user could read ALL financial docs + insert ────
drop policy if exists fd_insert on public.financial_documents;
drop policy if exists fd_select on public.financial_documents;
create policy fd_select on public.financial_documents
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from public.listings l where l.id = financial_documents.listing_id and public.is_agency_member(l.agency_id))
    or exists (select 1 from public.deals d where d.id = financial_documents.deal_id and public.is_agency_member(d.agency_id))
  );
create policy fd_insert on public.financial_documents
  for insert to authenticated
  with check (
    exists (select 1 from public.listings l where l.id = financial_documents.listing_id and public.is_agency_member(l.agency_id))
    or exists (select 1 from public.deals d where d.id = financial_documents.deal_id and public.is_agency_member(d.agency_id))
  );
create policy fd_owner_write on public.financial_documents
  for update to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());
create policy fd_owner_delete on public.financial_documents
  for delete to authenticated
  using (uploaded_by = auth.uid());

-- ── client_portal_access: portal TOKENS were readable by any user ───────────
drop policy if exists client_portal_access_select on public.client_portal_access;
drop policy if exists client_portal_access_delete on public.client_portal_access;
create policy client_portal_access_select on public.client_portal_access
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.deals d where d.id = client_portal_access.deal_id and public.is_agency_member(d.agency_id))
  );
create policy client_portal_access_delete on public.client_portal_access
  for delete to authenticated
  using (created_by = auth.uid());

-- ── email_emails: full queue (recipients + bodies) was readable by any user ──
drop policy if exists email_emails_owner_select on public.email_emails;
drop policy if exists email_emails_service_all on public.email_emails;
create policy email_emails_admin_select on public.email_emails
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy email_emails_service_all on public.email_emails
  for all to service_role using (true) with check (true);

-- ── portal_messages: deal messages readable by any user ─────────────────────
drop policy if exists portal_messages_select on public.portal_messages;
create policy portal_messages_select on public.portal_messages
  for select to authenticated
  using (exists (select 1 from public.deals d where d.id = portal_messages.deal_id and public.is_agency_member(d.agency_id)));
drop policy if exists portal_messages_insert on public.portal_messages;
create policy portal_messages_insert on public.portal_messages
  for insert to authenticated
  with check (exists (select 1 from public.deals d where d.id = portal_messages.deal_id and public.is_agency_member(d.agency_id)));

-- ── documents: fillable docs readable/writable by any user ──────────────────
drop policy if exists documents_auth_read on public.documents;
drop policy if exists documents_auth_insert on public.documents;
drop policy if exists documents_auth_write on public.documents;
create policy documents_auth_read on public.documents
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.listings l where l.id = documents.listing_id and public.is_agency_member(l.agency_id))
    or exists (select 1 from public.deals d where d.id = documents.deal_id and public.is_agency_member(d.agency_id))
  );
create policy documents_auth_insert on public.documents
  for insert to authenticated
  with check (
    exists (select 1 from public.listings l where l.id = documents.listing_id and public.is_agency_member(l.agency_id))
    or exists (select 1 from public.deals d where d.id = documents.deal_id and public.is_agency_member(d.agency_id))
  );
create policy documents_auth_write on public.documents
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ── deal_documents: every auth user could select/insert/update/delete ────────
drop policy if exists deal_documents_auth_select on public.deal_documents;
drop policy if exists deal_documents_auth_insert on public.deal_documents;
drop policy if exists deal_documents_auth_update on public.deal_documents;
drop policy if exists deal_documents_auth_delete on public.deal_documents;
create policy deal_documents_auth_select on public.deal_documents
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from public.deals d where d.id = deal_documents.deal_id and public.is_agency_member(d.agency_id))
  );
create policy deal_documents_auth_insert on public.deal_documents
  for insert to authenticated
  with check (exists (select 1 from public.deals d where d.id = deal_documents.deal_id and public.is_agency_member(d.agency_id)));
create policy deal_documents_auth_update on public.deal_documents
  for update to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());
create policy deal_documents_auth_delete on public.deal_documents
  for delete to authenticated
  using (uploaded_by = auth.uid());
