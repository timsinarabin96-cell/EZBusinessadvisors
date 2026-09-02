-- Agency-scoped agent onboarding gate. Deliberately separate from the global
-- paid CBI curriculum in training_* tables.

begin;

alter table public.profiles
  add column if not exists onboarding_required boolean not null default false;

create table if not exists public.onboarding_module_templates (
  id uuid primary key,
  title text not null,
  description text,
  lesson_content text not null,
  quiz_question text not null,
  quiz_options jsonb not null,
  quiz_correct_answer text not null,
  "order" integer not null,
  is_active boolean not null default true,
  unique ("order")
);

create table if not exists public.agency_training_programs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind text not null check (kind in ('onboarding')),
  title text not null default 'Agent Platform Onboarding',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agency_id, kind)
);

create table if not exists public.agency_training_modules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.agency_training_programs(id) on delete cascade,
  template_id uuid references public.onboarding_module_templates(id) on delete set null,
  title text not null,
  description text,
  lesson_content text not null,
  quiz_question text not null,
  quiz_options jsonb not null,
  quiz_correct_answer text not null,
  "order" integer not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, "order")
);

create table if not exists public.agency_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  program_id uuid not null references public.agency_training_programs(id) on delete cascade,
  invite_token_id uuid references public.invite_tokens(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete cascade,
  invite_email text,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  training_hold boolean not null default true,
  completed_at timestamptz,
  certificate_document_id uuid references public.documents(id) on delete set null,
  certificate_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agency_training_enrollment_invite_uq
  on public.agency_training_enrollments(invite_token_id) where invite_token_id is not null;
create unique index if not exists agency_training_enrollment_profile_uq
  on public.agency_training_enrollments(program_id, profile_id) where profile_id is not null;

create table if not exists public.agency_training_tasks (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.agency_training_enrollments(id) on delete cascade,
  module_id uuid not null references public.agency_training_modules(id) on delete cascade,
  completed boolean not null default false,
  quiz_score integer check (quiz_score between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, module_id)
);

insert into public.onboarding_module_templates
  (id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, "order")
values
('a1000000-0000-4000-8000-000000000001', 'Using the AI Advisor Interview', 'Run a complete, reviewable seller intake before building deal materials.', 'Start the seller intake from the listing workspace and use the AI advisor interview to gather the owner story, financial context, operations, reason for sale, facilities, employees, and growth opportunities. Treat AI prompts as an interview guide, not a substitute for judgment. Confirm unclear answers with the seller, preserve source documents, and flag contradictions for review before relying on them.', 'What is the correct use of the AI advisor interview?', '["Publish its output without review","Use it as a guided intake, verify answers, and flag contradictions","Skip seller source documents","Share the raw interview with buyers"]', 'Use it as a guided intake, verify answers, and flag contradictions', 1),
('a1000000-0000-4000-8000-000000000002', 'Reviewing AI-Generated CIMs and BOVs', 'Human approval is mandatory before buyer delivery.', 'AI-generated CIM and BOV drafts are working documents. Compare claims against intake answers and source financials, verify recast adjustments, remove unsupported statements, confirm confidentiality labels, and obtain the required internal approval. Never deliver an AI-generated draft to a buyer merely because generation finished.', 'When may an AI-generated CIM or BOV be delivered to a buyer?', '["Immediately after generation","After the buyer asks twice","Only after human review, corrections, and approval","Before financial figures are checked"]', 'Only after human review, corrections, and approval', 2),
('a1000000-0000-4000-8000-000000000003', 'Confidentiality and Pre-NDA Rules', 'Know what can be shared before and after confidentiality is established.', 'Before an NDA, share only an approved blind teaser that does not identify the business or expose sensitive operations, customers, employees, or exact location. CIMs, detailed financials, seller identity, and vault materials require the platform NDA/access workflow and the appropriate approval. When uncertain, stop and escalate rather than disclose.', 'Which item is appropriate before a buyer completes the NDA workflow?', '["The full CIM","Customer names","An approved blind teaser","The seller identity"]', 'An approved blind teaser', 3),
('a1000000-0000-4000-8000-000000000004', 'Due Diligence and Document Vault Workflow', 'Use staged access, least privilege, and an auditable document trail.', 'Create the data room only for an active transaction, organize documents by diligence category, and upload verified versions. Grant access through the request/review workflow, disclose only what the buyer is authorized to see, and use platform delivery links so views and decisions remain auditable. Revoke access promptly when a buyer exits the process.', 'How should sensitive diligence documents be shared?', '["As email attachments from a personal account","Through the reviewed platform data-room workflow","Through a public link","Before buyer qualification"]', 'Through the reviewed platform data-room workflow', 4),
('a1000000-0000-4000-8000-000000000005', 'Business-Intermediary Fundamentals', 'Apply core brokerage judgment while keeping onboarding separate from paid CBI certification.', 'A business intermediary protects confidentiality, qualifies both sides, documents material facts, manages expectations, and moves a transaction through valuation, marketing, negotiation, diligence, and closing. Disclose conflicts, avoid guarantees, maintain accurate records, and escalate legal, tax, lending, or licensing questions to qualified professionals. This onboarding module is tracked separately from CBI Module 1.', 'Which behavior best reflects business-intermediary fundamentals?', '["Guaranteeing a closing date","Giving legal advice outside your role","Documenting facts, protecting confidentiality, and escalating specialist questions","Sharing every document with every lead"]', 'Documenting facts, protecting confidentiality, and escalating specialist questions', 5)
on conflict (id) do update set
  title = excluded.title, description = excluded.description,
  lesson_content = excluded.lesson_content, quiz_question = excluded.quiz_question,
  quiz_options = excluded.quiz_options, quiz_correct_answer = excluded.quiz_correct_answer,
  "order" = excluded."order", is_active = true;

create or replace function public.ensure_agent_onboarding_for_invite(p_invite_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invite_tokens%rowtype;
  v_program_id uuid;
  v_enrollment_id uuid;
begin
  select * into v_invite from public.invite_tokens where id = p_invite_id;
  if not found or v_invite.target_type <> 'agent' or v_invite.agency_id is null then return null; end if;

  insert into public.agency_training_programs (agency_id, kind)
  values (v_invite.agency_id, 'onboarding')
  on conflict (agency_id, kind) do update set is_active = true
  returning id into v_program_id;

  insert into public.agency_training_modules
    (program_id, template_id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, "order")
  select v_program_id, id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, "order"
  from public.onboarding_module_templates where is_active
  on conflict (program_id, "order") do nothing;

  insert into public.agency_training_enrollments
    (agency_id, program_id, invite_token_id, profile_id, invite_email)
  values (v_invite.agency_id, v_program_id, v_invite.id, v_invite.target_id, lower(v_invite.email))
  on conflict (invite_token_id) where invite_token_id is not null do update
    set profile_id = coalesce(excluded.profile_id, agency_training_enrollments.profile_id), updated_at = now()
  returning id into v_enrollment_id;

  insert into public.agency_training_tasks (enrollment_id, module_id)
  select v_enrollment_id, id from public.agency_training_modules where program_id = v_program_id and is_required
  on conflict (enrollment_id, module_id) do nothing;

  if v_invite.target_id is not null then
    update public.profiles set onboarding_required = true where id = v_invite.target_id;
  end if;
  return v_enrollment_id;
end $$;

create or replace function public.agent_onboarding_invite_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_type = 'agent' then perform public.ensure_agent_onboarding_for_invite(new.id); end if;
  return new;
end $$;

drop trigger if exists agent_onboarding_invite_created on public.invite_tokens;
create trigger agent_onboarding_invite_created after insert on public.invite_tokens
for each row execute function public.agent_onboarding_invite_trigger();

drop trigger if exists agent_onboarding_invite_filled on public.invite_tokens;
create trigger agent_onboarding_invite_filled after update of target_id on public.invite_tokens
for each row when (new.target_type = 'agent' and new.target_id is not null)
execute function public.agent_onboarding_invite_trigger();

alter table public.onboarding_module_templates enable row level security;
alter table public.agency_training_programs enable row level security;
alter table public.agency_training_modules enable row level security;
alter table public.agency_training_enrollments enable row level security;
alter table public.agency_training_tasks enable row level security;

create policy onboarding_templates_read on public.onboarding_module_templates for select to authenticated using (true);
create policy agency_training_program_read on public.agency_training_programs for select to authenticated using (public.is_agency_member(agency_id));
create policy agency_training_module_read on public.agency_training_modules for select to authenticated using (
  exists (select 1 from public.agency_training_programs p where p.id = program_id and public.is_agency_member(p.agency_id))
);
create policy agency_training_enrollment_read on public.agency_training_enrollments for select to authenticated using (
  profile_id = auth.uid() or public.is_agency_admin(agency_id)
);
create policy agency_training_task_read on public.agency_training_tasks for select to authenticated using (
  exists (select 1 from public.agency_training_enrollments e where e.id = enrollment_id and (e.profile_id = auth.uid() or public.is_agency_admin(e.agency_id)))
);

revoke all on public.onboarding_module_templates, public.agency_training_programs,
  public.agency_training_modules, public.agency_training_enrollments, public.agency_training_tasks from anon;
grant select on public.onboarding_module_templates, public.agency_training_programs,
  public.agency_training_modules, public.agency_training_enrollments, public.agency_training_tasks to authenticated;

-- Backfill open agent invites. Existing active agents are intentionally not
-- retroactively held without an agency decision.
do $$ declare r record; begin
  for r in select id from public.invite_tokens where target_type = 'agent' and agency_id is not null and status <> 'revoked'
  loop perform public.ensure_agent_onboarding_for_invite(r.id); end loop;
end $$;

commit;
