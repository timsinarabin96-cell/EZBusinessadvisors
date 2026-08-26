-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Concord Letters of Intent — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Generated LOIs from accepted Offer Lab offers. Content is stored as JSON so
-- it can be re-rendered as HTML/PDF at any time without data loss.
-- =============================================================================

begin;

create table if not exists public.letters_of_intent (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  offer_id uuid references public.deal_offers(id) on delete set null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_lead_id uuid references public.buyer_leads(id) on delete set null,
  status text not null default 'draft',      -- draft | sent | signed | expired
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loi_agency_idx
  on public.letters_of_intent (agency_id, created_at desc);
create index if not exists loi_offer_idx
  on public.letters_of_intent (offer_id);
-- Unique per offer so upsert (onConflict: 'offer_id') is idempotent.
-- NULL offer_ids (deleted offers) are allowed to repeat.
create unique index if not exists loi_offer_uniq
  on public.letters_of_intent (offer_id);

alter table public.letters_of_intent enable row level security;

do $$
begin
  execute 'drop policy if exists loi_agency_access on public.letters_of_intent';
  execute 'create policy loi_agency_access on public.letters_of_intent for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.letters_of_intent from anon;
revoke truncate, references, trigger on public.letters_of_intent from authenticated;
grant select, insert, update, delete on public.letters_of_intent to authenticated;

commit;
