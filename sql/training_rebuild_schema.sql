-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Training rebuild (CBI 2.0) — additive, idempotent.
-- 1) training_gamification: per-broker XP / streak / tier state
-- 2) Kill the rickrolls: null out placeholder video URLs so lessons stop
--    embedding a Rick Astley link (real media added per lesson later)
-- 3) training_lesson_media: optional slide deck / audio per lesson
-- =============================================================================

begin;

create table if not exists public.training_gamification (
  broker_id          uuid primary key references public.profiles(id) on delete cascade,
  xp                 integer not null default 0,
  current_streak     integer not null default 0,
  best_streak        integer not null default 0,
  modules_certified  integer not null default 0,
  program_certified  boolean not null default false,
  last_active_at     timestamptz,
  updated_at         timestamptz not null default now()
);

create table if not exists public.training_lesson_media (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references public.training_lessons(id) on delete cascade,
  media_type  text not null default 'slides',   -- slides | audio | video
  url         text not null,
  title       text,
  "order"     int not null default 0,
  created_at  timestamptz not null default now(),
  unique (lesson_id, media_type, "order")
);

-- Kill the rickrolls: placeholder video links in the seed data.
update public.training_lessons
  set video_url = null
  where video_url like '%dQw4w9WgXcQ%';

alter table public.training_gamification enable row level security;
alter table public.training_lesson_media enable row level security;

drop policy if exists training_gamification_owner on public.training_gamification;
create policy training_gamification_owner on public.training_gamification
  for all to authenticated
  using (broker_id = auth.uid())
  with check (broker_id = auth.uid());

drop policy if exists training_lesson_media_read on public.training_lesson_media;
create policy training_lesson_media_read on public.training_lesson_media
  for select to authenticated using (true);

revoke all on public.training_gamification, public.training_lesson_media from anon;

commit;
