-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Publish pipeline schema — quality gates, scheduled publish, vetted badges.
-- -----------------------------------------------------------------------------
-- listings gains:
--   * publish_at   — scheduled go-live timestamp (NULL = publish immediately)
--   * vetted       — readiness >= 85 + verified financials → premium badge
--   * published_by — who flipped it live (for analytics)
-- =============================================================================

alter table public.listings add column if not exists publish_at timestamptz;
alter table public.listings add column if not exists vetted boolean not null default false;
alter table public.listings add column if not exists published_by uuid references public.profiles(id) on delete set null;
alter table public.listings add column if not exists published_at timestamptz;

-- Scheduled-publish sweep helper (called by cron): flips drafts whose
-- publish_at is due into active listings.
create or replace function public.process_scheduled_publishes()
returns table(processed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer := 0;
begin
  update public.listings
  set status = 'active',
      published_at = coalesce(published_at, now()),
      publish_at = null
  where status = 'draft'
    and publish_at is not null
    and publish_at <= now()
    and review_stage in ('approved', 'agent_review')
  returning 1 into n;

  -- Also handle listings approved without a review_stage set.
  update public.listings
  set status = 'active',
      published_at = coalesce(published_at, now()),
      publish_at = null
  where status = 'draft'
    and publish_at is not null
    and publish_at <= now()
    and (review_stage is null or review_stage not in ('changes_requested', 'rejected'));

  return query select n;
end;
$$;
