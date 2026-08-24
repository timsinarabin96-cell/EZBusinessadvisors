-- =============================================================================
-- Success-fee engine — the platform's transaction cut.
-- -----------------------------------------------------------------------------
-- When a deal closes, the platform automatically records a success fee based
-- on the final sale price (tiered). This is THE money printer: one closed
-- $2M deal = $20K–60K. Fees are agency-scoped, recorded idempotently when the
-- closing milestone completes, and surfaced in the platform admin view.
-- =============================================================================

create table if not exists public.deal_success_fees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  sale_price numeric(14,2) not null,
  fee_percent numeric(6,4) not null,
  fee_cents bigint not null,
  status text not null default 'recorded' check (status in ('recorded', 'invoiced', 'paid', 'waived')),
  stripe_invoice text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (listing_id, deal_id)
);

alter table public.deal_success_fees enable row level security;

drop policy if exists "success fees readable by agency members" on public.deal_success_fees;
create policy "success fees readable by agency members" on public.deal_success_fees
  for select using (
    exists (select 1 from public.agency_members m
            where m.agency_id = deal_success_fees.agency_id
              and m.profile_id = auth.uid())
  );

drop policy if exists "success fees writable by agency admins" on public.deal_success_fees;
create policy "success fees writable by agency admins" on public.deal_success_fees
  for all using (
    exists (select 1 from public.agency_members m
            where m.agency_id = deal_success_fees.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  ) with check (
    exists (select 1 from public.agency_members m
            where m.agency_id = deal_success_fees.agency_id
              and m.profile_id = auth.uid()
              and (m.is_owner = true or m.role = 'admin'))
  );

-- Platform-wide view (super admin reads this for revenue totals).
create or replace view public.platform_success_fee_stats as
select
  count(*) as deals,
  coalesce(sum(fee_cents), 0) as total_fee_cents,
  coalesce(sum(case when status = 'paid' then fee_cents else 0 end), 0) as paid_fee_cents
from public.deal_success_fees;
