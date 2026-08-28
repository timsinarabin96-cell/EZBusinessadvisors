-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Listing Legitimacy Gate (boss: "we don't want premature businesses or scam")
--   * established_year already exists on listings.
--   * New: 3 years of revenue (rev_y1 = 3 yrs ago … rev_y3 = last full year),
--     financials upload status + doc paths, AI legitimacy verdict.
--   * A listing can only go ACTIVE when legitimacy_verdict = 'auto_approved'
--     (AI gate passed) — else pending (broker review) or rejected.
--   * owner_email links public self-service listings to the seller's login.
-- Idempotent. Run in Supabase SQL Editor or via the management API.
-- =============================================================================

begin;

alter table public.listings add column if not exists revenue_year_1 numeric(14,2);  -- 3 fiscal years ago
alter table public.listings add column if not exists revenue_year_2 numeric(14,2);  -- 2 fiscal years ago
alter table public.listings add column if not exists revenue_year_3 numeric(14,2);  -- last full fiscal year
alter table public.listings add column if not exists financials_status text not null default 'missing';
alter table public.listings add column if not exists financials_doc_paths text[];
alter table public.listings add column if not exists financials_submitted_at timestamptz;
alter table public.listings add column if not exists legitimacy_score int;
alter table public.listings add column if not exists legitimacy_verdict text not null default 'pending';
alter table public.listings add column if not exists ai_reviewed_at timestamptz;
alter table public.listings add column if not exists owner_email text;

do $$
begin
  alter table public.listings drop constraint if exists listings_financials_status_check;
  alter table public.listings add constraint listings_financials_status_check
    check (financials_status in ('missing','submitted','approved','rejected'));
  alter table public.listings drop constraint if exists listings_legitimacy_verdict_check;
  alter table public.listings add constraint listings_legitimacy_verdict_check
    check (legitimacy_verdict in ('pending','auto_approved','broker_review','rejected'));
end $$;

create index if not exists listings_legitimacy_idx on public.listings (legitimacy_verdict, financials_status);
create index if not exists listings_owner_email_idx on public.listings (owner_email);

commit;
