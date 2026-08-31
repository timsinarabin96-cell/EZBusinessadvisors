-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- publish_force_audit_2026_08_31.sql — force-publish override audit trail.
-- -----------------------------------------------------------------------------
-- Every time a listing goes live bypassing the signature gates (force=true),
-- the override is REQUIRED to carry a broker-supplied reason and is recorded
-- here — who, when, why, and exactly which gates were bypassed — tied to the
-- listing. Compliance owner + agency team are notified automatically
-- (lib/publish.ts). Also stamps the listing row for at-a-glance visibility.
-- Idempotent.
-- =============================================================================

begin;

create table if not exists public.publish_force_audit (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  actor_id       uuid references public.profiles(id) on delete set null,
  actor_email    text,
  reason         text not null,
  bypassed_gates jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists publish_force_audit_listing_idx on public.publish_force_audit (listing_id);
create index if not exists publish_force_audit_created_idx on public.publish_force_audit (created_at desc);

alter table public.publish_force_audit enable row level security;

drop policy if exists "publish_force_audit_agency" on public.publish_force_audit;
create policy "publish_force_audit_agency" on public.publish_force_audit
  for select
  using (
    exists (
      select 1 from public.listings l
      join public.agency_members m on m.agency_id = l.agency_id
      where l.id = publish_force_audit.listing_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    )
  );

-- At-a-glance stamp on the listing itself.
alter table public.listings add column if not exists force_published_at timestamptz;
alter table public.listings add column if not exists force_published_by uuid references public.profiles(id);
alter table public.listings add column if not exists force_publish_reason text;

commit;
