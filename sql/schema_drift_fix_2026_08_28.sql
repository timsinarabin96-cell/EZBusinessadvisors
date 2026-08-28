-- =============================================================================
-- Schema drift fixes — restored DB was pre-migration state for 3 tables.
-- The code expects newer columns/views; apply additively (data-preserving).
-- Applied live 2026-08-28 after restore audit found 400s on these queries.
-- =============================================================================

-- cim_versions / bov_versions: add code-expected columns (older backup shape)
alter table public.cim_versions
  add column if not exists version int not null default 1,
  add column if not exists title text,
  add column if not exists content_json jsonb,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.bov_versions
  add column if not exists version int not null default 1,
  add column if not exists title text,
  add column if not exists content_json jsonb,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- listing_documents: add code-expected columns
alter table public.listing_documents
  add column if not exists document_type text not null default 'other',
  add column if not exists expires_at timestamptz;

-- certified_brokers: code expects a VIEW (computed modules_certified), the
-- restored DB had an empty legacy TABLE — replace with the proper view.
drop table if exists public.certified_brokers;
create or replace view public.certified_brokers as
select
  p.id as broker_id,
  p.full_name,
  p.email,
  p.avatar_url,
  count(distinct tc.module_id) as modules_certified,
  max(tc.issued_at) as last_certified_at
from public.profiles p
join public.training_certificates tc on tc.broker_id = p.id
group by p.id, p.full_name, p.email, p.avatar_url;
