-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- 1099 CONTRACTOR MODULE — 2026-08-26
-- Run this in the Supabase SQL Editor.
--
-- Tracks every contractor (agent/broker), their legal/W-9 info, and every
-- payment made to them, so year-end 1099-NEC preparation is one click:
-- YTD totals, $600 filing-threshold flags, printable previews, CSV export.
--
-- SECURITY: contains TINs/SSNs → admin-only RLS, masked in UI. Full values
-- stay in this admin-only table; recommend enabling Supabase Vault
-- (pgsodium) encryption at rest as a hardening follow-up.
-- =============================================================================

begin;

-- 1) Contractors — legal/W-9 identity
create table if not exists public.contractors (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid references public.agencies(id) on delete set null, -- null = platform (EZ Business Advisors)
  profile_id   uuid references public.profiles(id) on delete set null, -- link to their user account if any
  legal_name   text not null,                -- W-9 legal name (must match IRS records)
  dba_name     text,                         -- doing-business-as, if different
  entity_type  text not null default 'individual'
               check (entity_type in ('individual','single_member_llc','multi_member_llc','partnership','corporation','s_corp','other')),
  tin_type     text not null default 'ssn' check (tin_type in ('ein','ssn')),
  tin          text,                         -- full EIN/SSN (admin-only; masked in UI)
  address      text,                         -- street
  city         text,
  state        text,
  zip          text,
  w9_status    text not null default 'missing' check (w9_status in ('collected','pending','missing')),
  w9_file_path text,                         -- storage path to uploaded W-9 (private bucket)
  start_date   date,
  active       boolean not null default true,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists contractors_active_idx on public.contractors (active, legal_name);
create index if not exists contractors_agency_idx on public.contractors (agency_id);

-- 2) Payments — every dollar paid to a contractor
create table if not exists public.contractor_payments (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references public.contractors(id) on delete cascade,
  agency_id      uuid references public.agencies(id) on delete set null,
  amount         numeric(14,2) not null check (amount > 0),
  payment_date   date not null default current_date,
  method         text not null default 'other' check (method in ('ach','check','cash','stripe','paypal','other')),
  reference      text,                       -- check #, ACH ref, Stripe tx id
  category       text not null default 'commission' check (category in ('commission','bonus','referral','retainer','other')),
  commission_record_id uuid references public.commission_records(id) on delete set null, -- link to your commission ledger
  deal_id        uuid references public.deals(id) on delete set null,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists contractor_payments_contractor_idx on public.contractor_payments (contractor_id, payment_date desc);
create index if not exists contractor_payments_date_idx on public.contractor_payments (payment_date desc);

-- 3) RLS: admin-only (platform owner + admins — this holds TINs)
alter table public.contractors enable row level security;
alter table public.contractor_payments enable row level security;

drop policy if exists contractors_admin_all on public.contractors;
create policy contractors_admin_all on public.contractors
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

drop policy if exists contractor_payments_admin_all on public.contractor_payments;
create policy contractor_payments_admin_all on public.contractor_payments
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

revoke all on public.contractors from anon;
revoke all on public.contractor_payments from anon;
grant select, insert, update, delete on public.contractors to authenticated;
grant select, insert, update, delete on public.contractor_payments to authenticated;

commit;
