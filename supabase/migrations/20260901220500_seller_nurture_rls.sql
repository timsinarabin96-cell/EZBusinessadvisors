-- RLS for seller_nurture: service-role-only table (cron + webhook write it).
-- No anon/authenticated policies — the seller never reads this directly;
-- the seller portal reads live tables (financial_interviews, docs) instead.
alter table public.seller_nurture enable row level security;

drop policy if exists seller_nurture_service on public.seller_nurture;
create policy seller_nurture_service on public.seller_nurture
  for all using (false) with check (false);
