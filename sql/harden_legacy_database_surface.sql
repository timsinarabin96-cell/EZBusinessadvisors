-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

begin;

-- Legacy views must obey the querying user's RLS policies instead of running
-- with the view owner's privileges. None of these views are public endpoints.
alter view public.public_listing_feed set (security_invoker = true);
alter view public.active_listings_with_agent set (security_invoker = true);
alter view public.public_deal_stats set (security_invoker = true);
alter view public.deal_dashboard set (security_invoker = true);
alter view public.listings_with_images set (security_invoker = true);
alter view public.financial_summary_view set (security_invoker = true);

revoke all on public.public_listing_feed from anon;
revoke all on public.active_listings_with_agent from anon;
revoke all on public.public_deal_stats from anon;
revoke all on public.deal_dashboard from anon;
revoke all on public.listings_with_images from anon;
revoke all on public.financial_summary_view from anon;

-- Anonymous visitors have no legitimate reason to execute these privileged
-- helper, trigger, profile, image, deal, or authorization functions.
revoke execute on function public.add_image_to_listing(uuid, text, boolean) from public, anon;
revoke execute on function public.create_deal_from_lead(uuid, uuid, numeric) from public, anon;
revoke execute on function public.enforce_listing_approved_before_publish() from public, anon;
revoke execute on function public.get_current_user_role() from public, anon;
revoke execute on function public.get_listing_images(uuid) from public, anon;
revoke execute on function public.get_profile_with_avatar(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_agency_admin(uuid) from public, anon;
revoke execute on function public.is_agency_member(uuid) from public, anon;
revoke execute on function public.is_broker_or_admin() from public, anon;
revoke execute on function public.prevent_role_self_escalation() from public, anon;
revoke execute on function public.remove_image_from_listing(uuid, text) from public, anon;
revoke execute on function public.set_primary_image(uuid, text) from public, anon;
revoke execute on function public.update_profile_avatar(uuid, text, text) from public, anon;

grant execute on function public.add_image_to_listing(uuid, text, boolean) to authenticated;
grant execute on function public.create_deal_from_lead(uuid, uuid, numeric) to authenticated;
grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.get_listing_images(uuid) to authenticated;
grant execute on function public.get_profile_with_avatar(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_agency_admin(uuid) to authenticated;
grant execute on function public.is_agency_member(uuid) to authenticated;
grant execute on function public.is_broker_or_admin() to authenticated;
grant execute on function public.remove_image_from_listing(uuid, text) to authenticated;
grant execute on function public.set_primary_image(uuid, text) to authenticated;
grant execute on function public.update_profile_avatar(uuid, text, text) to authenticated;

-- Pin search_path for functions flagged by the Supabase security advisor.
do $$
declare
  function_record record;
begin
  for function_record in
    select procedure.oid::regprocedure as identity
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array[
        'handle_new_user',
        'update_listing_timestamp',
        'get_current_user_role',
        'update_deal_timestamp',
        'create_deal_from_lead',
        'auto_set_primary_image',
        'get_listing_images',
        'set_primary_image',
        'remove_image_from_listing',
        'add_image_to_listing',
        'update_profile_avatar',
        'get_profile_with_avatar',
        'is_broker_or_admin',
        'guess_financial_category',
        'auto_tag_financial_category',
        'update_financial_document_status',
        'detect_financial_document_type',
        'extract_financial_data',
        'auto_process_financial_document'
      ])
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', function_record.identity);
  end loop;
end;
$$;

commit;
