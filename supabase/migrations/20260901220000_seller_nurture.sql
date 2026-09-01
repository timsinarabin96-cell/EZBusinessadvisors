-- Seller nurture tracking: one row per PAID seller listing, drives the
-- automated follow-up sequence (24h interview nudge → docs reminder →
-- escalating reminders → 7-day stalled flag). The cron scans rows here,
-- checks live intake state (interview/docs/CIM), sends the right email,
-- and stamps last_nudge_at so nothing re-fires every run.
create table if not exists public.seller_nurture (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  seller_email   text not null,
  paid_at        timestamptz not null default now(),
  last_nudge_at  timestamptz,
  nudge_count    int not null default 0,
  status         text not null default 'active',   -- active | completed | flagged
  flagged_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (listing_id)
);
create index if not exists seller_nurture_active_idx on public.seller_nurture (status, last_nudge_at);
