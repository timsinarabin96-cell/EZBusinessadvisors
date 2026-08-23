-- =============================================================================
-- Communication Log (additive, idempotent)
-- -----------------------------------------------------------------------------
-- Every call/email/SMS/meeting with any party (seller, buyer, deal, listing)
-- logged with channel, direction, outcome, and summary. Feeds stale-deal
-- nudges and auto-reschedules call-backs when a call goes unanswered.
-- =============================================================================

begin;

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,  -- logged by
  listing_id uuid references public.listings(id) on delete cascade,
  buyer_lead_id uuid references public.buyer_leads(id) on delete cascade,
  seller_lead_id uuid references public.seller_leads(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  channel text not null default 'call',     -- call | email | sms | meeting | other
  direction text not null default 'outbound', -- outbound | inbound
  outcome text not null default 'other',    -- talked | voicemail | left_message | no_answer | email_sent | email_replied | meeting_held | other
  contact_name text,
  summary text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists communications_agency_idx
  on public.communications (agency_id, created_at desc);
create index if not exists communications_listing_idx
  on public.communications (listing_id, created_at desc);
create index if not exists communications_buyer_idx
  on public.communications (buyer_lead_id, created_at desc);
create index if not exists communications_seller_idx
  on public.communications (seller_lead_id, created_at desc);
create index if not exists communications_deal_idx
  on public.communications (deal_id, created_at desc);

alter table public.communications enable row level security;

do $$
begin
  execute 'drop policy if exists communications_agency_access on public.communications';
  execute 'create policy communications_agency_access on public.communications for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.communications from anon;
revoke truncate, references, trigger on public.communications from authenticated;
grant select, insert, update, delete on public.communications to authenticated;

commit;
