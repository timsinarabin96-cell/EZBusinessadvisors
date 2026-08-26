-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  target_type text not null,
  target_id uuid,
  agency_id uuid,
  email text,
  created_by uuid,
  status text not null default 'sent',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  filled_at timestamptz
);
alter table public.invite_tokens enable row level security;
drop policy if exists "invite_tokens_select_all" on public.invite_tokens;
create policy "invite_tokens_select_all" on public.invite_tokens for select using (true);
drop policy if exists "invite_tokens_insert_all" on public.invite_tokens;
create policy "invite_tokens_insert_all" on public.invite_tokens for insert with check (true);
drop policy if exists "invite_tokens_update_all" on public.invite_tokens;
create policy "invite_tokens_update_all" on public.invite_tokens for update using (true);
