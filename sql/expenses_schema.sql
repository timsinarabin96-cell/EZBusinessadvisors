-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Platform Expenses — advanced cost tracking (AI APIs, domains, hosting, SMS,
-- tools, marketing, other). Covers every vendor/cost center of the platform.
-- agency_id NULL = platform-level cost; otherwise per-tenant.
-- =============================================================================

begin;

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid references public.agencies(id) on delete cascade,  -- null = platform
  category      text not null default 'other'
                check (category in
                  ('ai_api','hosting','domain','sms_phone','email','tools','marketing','subscriptions','other')),
  vendor        text not null,          -- e.g. OpenAI, DeepSeek, Anthropic, Vercel, Supabase, Namecheap, Twilio
  description   text,                   -- e.g. "DeepSeek v4 API — August", "concordplatform.com renewal"
  amount_cents  integer not null check (amount_cents >= 0),
  currency      text not null default 'USD',
  expense_date  date not null default current_date,
  recurring     boolean not null default false,   -- recurring monthly cost
  paid          boolean not null default false,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_category_idx on public.expenses (category);
create index if not exists expenses_vendor_idx on public.expenses (vendor);
create index if not exists expenses_agency_idx on public.expenses (agency_id);

alter table public.expenses enable row level security;

-- Platform admins (super_admin) can manage all expenses.
do $$
begin
  execute 'drop policy if exists expenses_admin_all on public.expenses';
  execute 'create policy expenses_admin_all on public.expenses for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))
  )';
end $$;

-- Agency-scoped read for members of the owning agency (platform-level costs excluded).
do $$
begin
  execute 'drop policy if exists expenses_agency_read on public.expenses';
  execute 'create policy expenses_agency_read on public.expenses for select to authenticated using (
    agency_id is not null and public.is_agency_member(agency_id)
  )';
end $$;

revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

commit;
