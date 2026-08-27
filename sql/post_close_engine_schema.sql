-- =============================================================================
-- Post-Close Referral Engine — schema for check-ins after a deal closes.
-- 90-day seller check-ins, timed referral + testimonial asks, and the yearly
-- re-engagement (valuation refresh) that turns past clients into new listings.
-- =============================================================================

create table if not exists public.post_close_checkins (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  listing_id     uuid references public.listings(id) on delete cascade,
  deal_id        uuid references public.deals(id) on delete set null,
  seller_name    text,
  seller_email   text,
  buyer_name     text,
  buyer_email    text,
  closed_at      timestamptz,
  checkin_type   text not null default 'day90'
                 check (checkin_type in ('day90','referral_ask','testimonial_ask','yearly_valuation')),
  status         text not null default 'scheduled'
                 check (status in ('scheduled','sent','replied','converted','skipped')),
  due_at         timestamptz not null,
  sent_at        timestamptz,
  reply          text,
  converted_listing_id uuid references public.listings(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists post_close_checkins_due_idx on public.post_close_checkins (agency_id, status, due_at);
create index if not exists post_close_checkins_listing_idx on public.post_close_checkins (listing_id);

alter table public.post_close_checkins enable row level security;
drop policy if exists "pcc_agency_select" on public.post_close_checkins;
create policy "pcc_agency_select" on public.post_close_checkins for select to authenticated using (
  exists (select 1 from public.agency_members am where am.agency_id = post_close_checkins.agency_id and am.profile_id = auth.uid())
);
drop policy if exists "pcc_agency_insert" on public.post_close_checkins;
create policy "pcc_agency_insert" on public.post_close_checkins for insert to authenticated with check (
  exists (select 1 from public.agency_members am where am.agency_id = post_close_checkins.agency_id and am.profile_id = auth.uid())
);
drop policy if exists "pcc_agency_update" on public.post_close_checkins;
create policy "pcc_agency_update" on public.post_close_checkins for update to authenticated using (
  exists (select 1 from public.agency_members am where am.agency_id = post_close_checkins.agency_id and am.profile_id = auth.uid())
);
