-- =============================================================================
-- password_vault — per-user saved passwords (CRM "Save Passwords" section).
-- Owner-only RLS. Passwords are encrypted at rest by the app (AES-256-GCM via
-- /api/vault using a server-side key); this table only ever holds ciphertext.
-- =============================================================================

create table if not exists public.password_vault (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  url text,
  username text,
  encrypted_password text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.password_vault enable row level security;

drop policy if exists "password_vault owner select" on public.password_vault;
create policy "password_vault owner select" on public.password_vault
  for select using (auth.uid() = profile_id);

drop policy if exists "password_vault owner insert" on public.password_vault;
create policy "password_vault owner insert" on public.password_vault
  for insert with check (auth.uid() = profile_id);

drop policy if exists "password_vault owner update" on public.password_vault;
create policy "password_vault owner update" on public.password_vault
  for update using (auth.uid() = profile_id);

drop policy if exists "password_vault owner delete" on public.password_vault;
create policy "password_vault owner delete" on public.password_vault
  for delete using (auth.uid() = profile_id);

create index if not exists password_vault_profile_id_idx on public.password_vault (profile_id);
