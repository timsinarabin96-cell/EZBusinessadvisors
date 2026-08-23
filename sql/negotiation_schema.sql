-- =============================================================================
-- Concord AI Negotiation Assistant — schema (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Counter-offer drafts generated from Offer Lab offers. Each draft stores a
-- jsonb content blob (counter variants + rationale) plus a printable HTML
-- letter. One draft per offer (unique index) so regeneration upserts.
-- =============================================================================

begin;

create table if not exists public.negotiation_drafts (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  offer_id   uuid not null references public.deal_offers(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  draft_type text not null default 'counter' check (draft_type in ('counter', 'response', 'playbook')),
  content    jsonb not null default '{}'::jsonb,
  html       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists negotiation_drafts_agency_idx
  on public.negotiation_drafts (agency_id, created_at desc);
create index if not exists negotiation_drafts_listing_idx
  on public.negotiation_drafts (listing_id);

-- Unique per offer so upsert (onConflict: 'offer_id') is idempotent.
create unique index if not exists negotiation_drafts_offer_uniq
  on public.negotiation_drafts (offer_id);

-- ---------------------------------------------------------------------------
-- RLS: agency-scoped like every other tenant table
-- ---------------------------------------------------------------------------
alter table public.negotiation_drafts enable row level security;

do $$
begin
  execute 'drop policy if exists negotiation_drafts_agency_access on public.negotiation_drafts';
  execute 'create policy negotiation_drafts_agency_access on public.negotiation_drafts for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.negotiation_drafts from anon;
revoke truncate, references, trigger on public.negotiation_drafts from authenticated;
grant select, insert, update, delete on public.negotiation_drafts to authenticated;

commit;
