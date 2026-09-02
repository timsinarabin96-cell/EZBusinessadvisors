-- Agency-owned onboarding programs and lesson materials.
-- Commit this migration with the application build; apply separately after review.

begin;

alter table public.agency_training_programs
  add column if not exists use_default_templates boolean not null default true;

alter table public.agency_training_modules
  add column if not exists materials jsonb not null default '[]'::jsonb,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.agency_training_modules
    add constraint agency_training_modules_materials_array
    check (jsonb_typeof(materials) = 'array');
exception when duplicate_object then null;
end $$;

alter table public.agency_training_modules
  drop constraint if exists agency_training_modules_program_id_order_key;
create unique index if not exists agency_training_modules_active_order_uq
  on public.agency_training_modules(program_id, "order") where archived_at is null;

create or replace function public.ensure_agent_onboarding_for_invite(p_invite_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invite_tokens%rowtype;
  v_program_id uuid;
  v_use_default_templates boolean;
  v_enrollment_id uuid;
begin
  select * into v_invite from public.invite_tokens where id = p_invite_id;
  if not found or v_invite.target_type <> 'agent' or v_invite.agency_id is null then return null; end if;
  if not exists (select 1 from public.agencies where id = v_invite.agency_id) then return null; end if;

  insert into public.agency_training_programs (agency_id, kind)
  values (v_invite.agency_id, 'onboarding')
  on conflict (agency_id, kind) do update set is_active = true
  returning id, use_default_templates into v_program_id, v_use_default_templates;

  if v_use_default_templates then
    insert into public.agency_training_modules
      (program_id, template_id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, "order")
    select v_program_id, t.id, t.title, t.description, t.lesson_content, t.quiz_question,
      t.quiz_options, t.quiz_correct_answer,
      coalesce((select max(m."order") from public.agency_training_modules m where m.program_id = v_program_id and m.archived_at is null), 0)
        + row_number() over (order by t."order")
    from public.onboarding_module_templates t
    where t.is_active
      and not exists (
        select 1 from public.agency_training_modules m
        where m.program_id = v_program_id and m.template_id = t.id
      );

    update public.agency_training_modules m set
      archived_at = null,
      "order" = coalesce((select max(active."order") from public.agency_training_modules active where active.program_id = v_program_id and active.archived_at is null), 0)
        + restored.position,
      updated_at = now()
    from (
      select id, row_number() over (order by "order") as position
      from public.agency_training_modules
      where program_id = v_program_id and template_id is not null and archived_at is not null
    ) restored
    where m.id = restored.id;
  end if;

  insert into public.agency_training_enrollments
    (agency_id, program_id, invite_token_id, profile_id, invite_email)
  values (v_invite.agency_id, v_program_id, v_invite.id, v_invite.target_id, lower(v_invite.email))
  on conflict (invite_token_id) where invite_token_id is not null do update
    set profile_id = coalesce(excluded.profile_id, agency_training_enrollments.profile_id), updated_at = now()
  returning id into v_enrollment_id;

  insert into public.agency_training_tasks (enrollment_id, module_id)
  select v_enrollment_id, id
  from public.agency_training_modules
  where program_id = v_program_id
    and archived_at is null
    and is_required
    and (v_use_default_templates or template_id is null)
  on conflict (enrollment_id, module_id) do nothing;

  if v_invite.target_id is not null then
    update public.profiles set onboarding_required = true where id = v_invite.target_id;
  end if;
  return v_enrollment_id;
end $$;

drop policy if exists agency_training_program_manage on public.agency_training_programs;
create policy agency_training_program_manage on public.agency_training_programs
  for update to authenticated
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

drop policy if exists agency_training_module_manage on public.agency_training_modules;
create policy agency_training_module_manage on public.agency_training_modules
  for all to authenticated
  using (
    exists (
      select 1 from public.agency_training_programs p
      where p.id = program_id and public.is_agency_admin(p.agency_id)
    )
  )
  with check (
    exists (
      select 1 from public.agency_training_programs p
      where p.id = program_id and public.is_agency_admin(p.agency_id)
    )
  );

grant insert, update, delete on public.agency_training_modules to authenticated;
grant update on public.agency_training_programs to authenticated;

commit;
