-- =============================================================================
-- Agent Hiring Packages (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Brokerages hire advisors with structured packages: role, commission split,
-- training/certification requirements, permissions. Applications reference a
-- package; agreements (IC/employee) attach on approval.
-- =============================================================================

begin;

create table if not exists public.hiring_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'advisor',
  description text,
  commission_split numeric not null default 50,
  base_compensation numeric,
  training_required boolean not null default true,
  certification_required boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Applications reference a hiring package.
alter table public.agent_applications add column if not exists package_id uuid references public.hiring_packages(id) on delete set null;
alter table public.agent_applications add column if not exists desired_start_date date;
alter table public.agent_applications add column if not exists notes text;

create index if not exists hiring_packages_active_idx on public.hiring_packages (is_active, commission_split desc);
create index if not exists agent_applications_status_idx on public.agent_applications (status, submitted_at desc);

alter table public.hiring_packages enable row level security;
alter table public.agent_applications enable row level security;

do $$ begin
  drop policy if exists hiring_packages_agency_read on public.hiring_packages;
  create policy hiring_packages_agency_read on public.hiring_packages for select to authenticated using (true);
end $$;

do $$ begin
  drop policy if exists agent_applications_public_insert on public.agent_applications;
  create policy agent_applications_public_insert on public.agent_applications for insert to anon with check (true);
end $$;

do $$ begin
  drop policy if exists agent_applications_agency_read on public.agent_applications;
  create policy agent_applications_agency_read on public.agent_applications for select to authenticated using (true);
end $$;

do $$ begin
  drop policy if exists agent_applications_agency_update on public.agent_applications;
  create policy agent_applications_agency_update on public.agent_applications for update to authenticated using (true) with check (true);
end $$;

revoke truncate, references, trigger on public.hiring_packages, public.agent_applications from authenticated;
grant select on public.hiring_packages to authenticated;
grant select, insert, update on public.agent_applications to authenticated;
grant insert on public.agent_applications to anon;

-- Seed default packages once.
insert into public.hiring_packages (name, role, description, commission_split, base_compensation, training_required, certification_required, permissions, is_active)
select * from (values
  ('Associate Advisor', 'advisor', 'Entry advisor: learn the craft, shadow senior brokers, 50/50 split.', 50, null, true, true, '{"listings":"create","leads":"full","commission_approval":false}'::jsonb, true),
  ('Senior Advisor', 'senior_advisor', 'Experienced advisor with own book of business, 70/30 split.', 70, null, false, true, '{"listings":"full","leads":"full","commission_approval":false}'::jsonb, true),
  ('Managing Broker', 'managing_broker', 'Runs the office: approves listings, sets splits, mentors team.', 80, 80000, false, true, '{"listings":"approve","leads":"full","commission_approval":true,"hiring":true}'::jsonb, true)
) as seed(name, role, description, commission_split, base_compensation, training_required, certification_required, permissions, is_active)
where not exists (select 1 from public.hiring_packages);

commit;
