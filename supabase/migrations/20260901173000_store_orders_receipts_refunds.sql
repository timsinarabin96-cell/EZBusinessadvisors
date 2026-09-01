-- Receipts + refunds + admin visibility for store orders.
alter table public.store_orders
  add column if not exists buyer_email text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refund_amount numeric(10,2),
  add column if not exists refund_stripe_ref text;

-- Owner/admin can read ALL store orders for the admin dashboard
-- (existing policy only lets buyers see their own).
drop policy if exists store_orders_admin on public.store_orders;
create policy store_orders_admin on public.store_orders
  for select using (
    exists (
      select 1 from public.agency_members am
      where am.agency_id = store_orders.agency_id
        and am.profile_id = auth.uid()
        and (am.is_owner = true or am.role = 'admin')
    )
  );
