-- ============================================================================
-- Document signing links (2026-08-29)
-- Token-based accountless signing: broker sends a document to seller/buyer,
-- each party gets a private signing link (no login needed). When ALL parties
-- have signed, the executed PDF is generated, saved to the documents bucket,
-- and the document flips to 'signed'.
-- ============================================================================

create table if not exists public.document_signing_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  party_key text not null,
  party_name text,
  party_email text,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','viewed','signed','expired')),
  signed_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz,
  unique (document_id, party_key)
);

alter table public.document_signing_links enable row level security;

-- Service role + authenticated owners may read/write signing links.
create policy "document_signing_links_service" on public.document_signing_links
  for all using (true) with check (true);
