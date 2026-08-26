-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Agency onboarding — AI-guided first-week setup after plan conversion.
-- Flow: Convert → payment confirmed → owner gets a "create your login" email
-- (Supabase invite) → first login lands on /onboarding → AI bot walks them
-- through profile, branding, AI API key, first listing, team, billing →
-- they click "I'm good" to complete. Steps tracked here so the guide resumes.
-- =============================================================================

begin;

create table if not exists public.agency_onboarding (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  owner_email    text not null,
  status         text not null default 'invited',   -- invited | active | completed
  plan_type      text,                              -- free | professional | enterprise
  amount_paid    integer,                           -- cents
  payment_method text,
  current_step   int not null default 0,
  steps          jsonb not null default '[]',       -- [{key,label,done}]
  invite_sent_at timestamptz,
  activated_at   timestamptz,
  completed_at   timestamptz,
  week_ends_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (agency_id)
);

create index if not exists agency_onboarding_status_idx on public.agency_onboarding (status);

alter table public.agency_onboarding enable row level security;

-- Platform admins manage; agency members read their own.
do $$
begin
  execute 'drop policy if exists agency_onboarding_admin on public.agency_onboarding';
  execute 'create policy agency_onboarding_admin on public.agency_onboarding for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
  )';
end $$;

do $$
begin
  execute 'drop policy if exists agency_onboarding_member on public.agency_onboarding';
  execute 'create policy agency_onboarding_member on public.agency_onboarding for select to authenticated using (
    public.is_agency_member(agency_id)
  )';
end $$;

revoke all on public.agency_onboarding from anon;
grant select, insert, update, delete on public.agency_onboarding to authenticated;

commit;
