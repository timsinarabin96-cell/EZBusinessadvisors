-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Listing Reference IDs + Seller Call-Back Reminders (additive, idempotent)
-- -----------------------------------------------------------------------------
-- 1) listings.listing_ref — human-readable per-listing ID (e.g. EZB-0001),
--    auto-assigned on insert via trigger; backfilled for existing rows.
-- 2) reminders — call-back / follow-up / task reminders per listing, with
--    due time, status lifecycle, and optional owner (broker) attribution.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Listing reference IDs
-- ---------------------------------------------------------------------------
create sequence if not exists public.listing_ref_seq;

alter table public.listings add column if not exists listing_ref text;
create unique index if not exists listings_ref_uniq on public.listings (listing_ref);

-- Auto-assign on insert (skips rows that already have a ref).
create or replace function public.assign_listing_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
begin
  if new.listing_ref is null or new.listing_ref = '' then
    select coalesce(upper(regexp_replace(a.slug, '[^a-z0-9]', '', 'g')), '') into prefix
    from public.agencies a where a.id = new.agency_id;
    if prefix = '' or length(prefix) < 2 then
      prefix := 'CDX';
    else
      prefix := left(prefix, 3);
    end if;
    new.listing_ref := prefix || '-' || lpad(nextval('public.listing_ref_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists listings_assign_ref on public.listings;
create trigger listings_assign_ref
  before insert on public.listings
  for each row execute function public.assign_listing_ref();

-- Backfill existing listings (ordered by creation) that lack a ref.
do $$
declare
  prefix text;
  r record;
  counter bigint;
begin
  select coalesce(upper(regexp_replace(a.slug, '[^a-z0-9]', '', 'g')), '') into prefix
  from public.agencies a order by a.created_at limit 1;
  if prefix = '' or length(prefix) < 2 then prefix := 'CDX'; else prefix := left(prefix, 3); end if;

  counter := (select coalesce(last_value, 0) from public.listing_ref_seq);
  for r in
    select id from public.listings
    where listing_ref is null or listing_ref = ''
    order by created_at, id
  loop
    counter := counter + 1;
    update public.listings
    set listing_ref = prefix || '-' || lpad(counter::text, 4, '0')
    where id = r.id;
  end loop;
  perform setval('public.listing_ref_seq', counter, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Reminders (call-back sellers, follow-ups, tasks)
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,   -- owner broker (null = agency-wide)
  listing_id uuid references public.listings(id) on delete cascade,
  title text not null,
  notes text,
  kind text not null default 'call_back',   -- call_back | follow_up | task | meeting
  due_at timestamptz not null,
  status text not null default 'pending',   -- pending | done | cancelled
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists reminders_agency_idx
  on public.reminders (agency_id, status, due_at);
create index if not exists reminders_listing_idx
  on public.reminders (listing_id, due_at);

alter table public.reminders enable row level security;

do $$
begin
  execute 'drop policy if exists reminders_agency_access on public.reminders';
  execute 'create policy reminders_agency_access on public.reminders for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.reminders from anon;
revoke truncate, references, trigger on public.reminders from authenticated;
grant select, insert, update, delete on public.reminders to authenticated;

commit;
