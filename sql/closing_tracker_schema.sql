-- =============================================================================
-- Concord Closing & Escrow Tracker — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- 1) deal_closing_milestones — per-deal checklist from LOI through close.
-- 2) deal_escrow_accounts   — escrow deposits with funding/release status.
-- Agency-scoped like every other tenant table.
-- =============================================================================

begin;

create table if not exists public.deal_closing_milestones (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  title text not null,
  category text not null default 'milestone',  -- loi | psa | diligence | escrow | closing | transition | other
  due_date timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists closing_milestones_agency_idx
  on public.deal_closing_milestones (agency_id, listing_id, sort_order);
create index if not exists closing_milestones_due_idx
  on public.deal_closing_milestones (listing_id, due_date);

create table if not exists public.deal_escrow_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  escrow_company text,
  account_ref text,
  amount numeric(14,2),
  status text not null default 'pending',     -- pending | funded | released | refunded
  funded_at timestamptz,
  released_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists escrow_agency_idx
  on public.deal_escrow_accounts (agency_id, listing_id, status);

alter table public.deal_closing_milestones enable row level security;
alter table public.deal_escrow_accounts enable row level security;

do $$
begin
  execute 'drop policy if exists closing_milestones_agency_access on public.deal_closing_milestones';
  execute 'create policy closing_milestones_agency_access on public.deal_closing_milestones for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
  execute 'drop policy if exists escrow_agency_access on public.deal_escrow_accounts';
  execute 'create policy escrow_agency_access on public.deal_escrow_accounts for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.deal_closing_milestones from anon;
revoke all on public.deal_escrow_accounts from anon;
revoke truncate, references, trigger on public.deal_closing_milestones from authenticated;
revoke truncate, references, trigger on public.deal_escrow_accounts from authenticated;
grant select, insert, update, delete on public.deal_closing_milestones to authenticated;
grant select, insert, update, delete on public.deal_escrow_accounts to authenticated;

commit;
