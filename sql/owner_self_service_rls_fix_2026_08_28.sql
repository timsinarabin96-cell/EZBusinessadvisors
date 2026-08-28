-- ============================================================================
-- Owner self-service visibility fix (2026-08-28)
-- After the project restore, agency-isolation RLS blocked public sellers from
-- reading their own listings/orders, and seller_listing_orders lost the
-- seller_email column the owner dashboard queries.
--
-- Fix: add seller_email to orders + owner-scoped SELECT policies (additive).
-- ============================================================================

-- 1) seller_listing_orders: restore the seller_email column (code queries it).
alter table public.seller_listing_orders
  add column if not exists seller_email text;

create index if not exists seller_listing_orders_seller_email_idx
  on public.seller_listing_orders (seller_email);

-- 2) Owner read of their own listing (public self-service sellers).
drop policy if exists listings_owner_select on public.listings;
create policy listings_owner_select on public.listings
  for select to authenticated
  using (owner_email is not null and lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- 3) Owner read of their own listing orders.
drop policy if exists seller_listing_orders_owner_select on public.seller_listing_orders;
create policy seller_listing_orders_owner_select on public.seller_listing_orders
  for select to authenticated
  using (seller_email is not null and lower(seller_email) = lower(auth.jwt() ->> 'email'));
