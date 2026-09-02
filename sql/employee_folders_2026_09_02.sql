-- Employee document folders for onboarding certificates and future HR records.
-- Apply after agent_onboarding_training_2026_09_02.sql.

begin;

alter table public.documents
  add column if not exists folder text not null default 'General';

create index if not exists documents_employee_folder_idx
  on public.documents (folder, ((filled_data ->> 'agency_id')), ((filled_data ->> 'employee_profile_id')))
  where folder = 'Employee Files';

-- Preserve the legacy authenticated read behavior for non-employee documents,
-- while restricting Employee Files to the employee or an agency administrator.
drop policy if exists "documents_auth_read" on public.documents;
create policy "documents_auth_read" on public.documents
  for select to authenticated
  using (
    folder <> 'Employee Files'
    or created_by = auth.uid()
    or filled_data ->> 'employee_profile_id' = auth.uid()::text
    or (
      nullif(filled_data ->> 'agency_id', '') is not null
      and public.is_agency_admin((filled_data ->> 'agency_id')::uuid)
    )
  );

commit;
