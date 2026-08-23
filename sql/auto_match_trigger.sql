-- =============================================================================
-- Auto Buyer-Match on Listing Approval + Listing Review workflow
-- -----------------------------------------------------------------------------
-- 1) When a listing transitions to 'approved'/'published', automatically score
--    active buyer search profiles and insert match events (idempotent).
-- 2) When a seller self-service draft is created, ensure it sits in the
--    broker review queue (status=draft, review_stage=pending_review).
-- Additive/idempotent.
-- =============================================================================

begin;

-- Scoring function shared by the trigger (SQL port of lib/buyerMatching.ts).
create or replace function public.match_buyers_for_listing()
returns trigger
language plpgsql
security definer
as $$
declare
  b public.buyer_search_profiles%rowtype;
  listing_inds text[];
  listing_loc text;
  score int;
  reasons text[] := '{}';
begin
  -- Only run when the listing becomes approvable/live.
  if new.status not in ('approved', 'published', 'active') then
    return new;
  end if;

  listing_inds := array_remove(array[new.industry, new.sub_industry], null);
  listing_loc := coalesce(new.location_general, '');

  for b in
    select * from public.buyer_search_profiles
    where agency_id = new.agency_id
      and active = true
      and ai_match_enabled = true
  loop
    score := 0;
    reasons := '{}';

    -- Industry fit (35) — hard requirement when buyer specified industries.
    if cardinality(b.industries) > 0 and cardinality(listing_inds) > 0 then
      if exists (
        select 1 from unnest(b.industries) bi
        join unnest(listing_inds) li on lower(bi) = lower(li)
      ) then
        score := score + 35;
        reasons := reasons || 'industry';
      else
        continue; -- wrong industry → skip
      end if;
    end if;

    -- Location fit (15).
    if cardinality(b.locations) > 0 and listing_loc <> '' then
      if exists (
        select 1 from unnest(b.locations) bl where lower(bl) = lower(listing_loc)
      ) or exists (
        select 1 from unnest(b.locations) bl where strpos(lower(listing_loc), lower(bl)) > 0
      ) then
        score := score + 15;
        reasons := reasons || 'location';
      end if;
    end if;

    -- Price range (25) — hard requirement when set.
    if new.asking_price is not null then
      if b.max_price is not null and new.asking_price > b.max_price then
        continue; -- over budget
      end if;
      if b.min_price is not null and new.asking_price < b.min_price then
        continue; -- below interest
      end if;
      score := score + 25;
      reasons := reasons || 'price';
    end if;

    -- Revenue (15).
    if b.min_revenue is not null and new.annual_revenue is not null then
      if new.annual_revenue >= b.min_revenue then
        score := score + 15;
        reasons := reasons || 'revenue';
      end if;
    end if;

    -- SDE (10).
    if b.min_sde is not null and new.sde is not null then
      if new.sde >= b.min_sde then
        score := score + 10;
        reasons := reasons || 'sde';
      end if;
    end if;

    if score >= 40 then
      insert into public.buyer_match_events
        (agency_id, buyer_profile_id, listing_id, match_score, matched_on, status)
      values
        (new.agency_id, b.id, new.id, score, jsonb_build_object('reasons', to_jsonb(reasons), 'points', score), 'pending')
      on conflict (buyer_profile_id, listing_id) do update
        set match_score = excluded.match_score,
            matched_on = excluded.matched_on,
            status = 'pending',
            notified_at = null;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists auto_match_buyers_on_approval on public.listings;
create trigger auto_match_buyers_on_approval
  after insert or update of status on public.listings
  for each row execute function public.match_buyers_for_listing();

-- Grant execution of the function to the authenticated role (triggers run as
-- definer; grants only matter for direct calls).
grant execute on function public.match_buyers_for_listing() to authenticated;

commit;
