begin;

-- Establish the existing brokerage as the first tenant without changing any
-- business records. The fixed UUID also provides a deterministic routing
-- target for the current public website until white-label domain routing ships.
insert into public.agencies (id, name, slug, domain, brand_color, accent_color, is_active)
values (
  '354facdb-cce2-4eb0-a160-8454854e731a',
  'EZ Business Advisors',
  'ez-business-advisors',
  'ezbusinessadvisors.com',
  '#1a1a2e',
  '#c9a84c',
  true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  domain = excluded.domain,
  is_active = true;

insert into public.agency_members (agency_id, profile_id, role, is_owner)
select
  '354facdb-cce2-4eb0-a160-8454854e731a',
  profile.id,
  'admin',
  profile.email = 'rtimsina@ezbusinessadvisors.com'
from public.profiles profile
where profile.email in ('rtimsina@ezbusinessadvisors.com', 'dev-testing@ezbusinessadvisors.com')
  and not exists (
    select 1 from public.agency_members member
    where member.agency_id = '354facdb-cce2-4eb0-a160-8454854e731a'
      and member.profile_id = profile.id
  );

alter table public.listings add column if not exists agency_id uuid;
alter table public.buyer_leads add column if not exists agency_id uuid;
alter table public.seller_leads add column if not exists agency_id uuid;
alter table public.deals add column if not exists agency_id uuid;

update public.listings
set agency_id = '354facdb-cce2-4eb0-a160-8454854e731a'
where agency_id is null;

update public.buyer_leads lead
set agency_id = coalesce(
  (select listing.agency_id from public.listings listing where listing.id = lead.listing_id),
  '354facdb-cce2-4eb0-a160-8454854e731a'
)
where agency_id is null;

update public.seller_leads lead
set agency_id = coalesce(
  (select listing.agency_id from public.listings listing where listing.id = lead.converted_listing_id),
  (select member.agency_id from public.agency_members member where member.profile_id = lead.claimed_by order by member.is_owner desc, member.created_at limit 1),
  '354facdb-cce2-4eb0-a160-8454854e731a'
)
where agency_id is null;

update public.deals deal
set agency_id = coalesce(
  (select listing.agency_id from public.listings listing where listing.id = deal.listing_id),
  '354facdb-cce2-4eb0-a160-8454854e731a'
)
where agency_id is null;

alter table public.listings alter column agency_id set not null;
alter table public.buyer_leads alter column agency_id set not null;
alter table public.seller_leads alter column agency_id set not null;
alter table public.deals alter column agency_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_agency_id_fkey') then
    alter table public.listings add constraint listings_agency_id_fkey foreign key (agency_id) references public.agencies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'buyer_leads_agency_id_fkey') then
    alter table public.buyer_leads add constraint buyer_leads_agency_id_fkey foreign key (agency_id) references public.agencies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'seller_leads_agency_id_fkey') then
    alter table public.seller_leads add constraint seller_leads_agency_id_fkey foreign key (agency_id) references public.agencies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_agency_id_fkey') then
    alter table public.deals add constraint deals_agency_id_fkey foreign key (agency_id) references public.agencies(id) on delete restrict;
  end if;
end;
$$;

create index if not exists listings_agency_id_idx on public.listings(agency_id);
create index if not exists buyer_leads_agency_id_idx on public.buyer_leads(agency_id);
create index if not exists seller_leads_agency_id_idx on public.seller_leads(agency_id);
create index if not exists deals_agency_id_idx on public.deals(agency_id);

-- Fill tenant IDs for legacy callers that do not yet send agency_id. These
-- trigger functions are not executable as RPCs.
create or replace function public.assign_listing_agency()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.agency_id is null then
    select member.agency_id into new.agency_id
    from public.agency_members member
    where member.profile_id = auth.uid()
    order by member.is_owner desc, member.created_at
    limit 1;
  end if;
  new.agency_id := coalesce(new.agency_id, '354facdb-cce2-4eb0-a160-8454854e731a');
  return new;
end;
$$;

create or replace function public.assign_buyer_lead_agency()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.agency_id is null and new.listing_id is not null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.listing_id;
  end if;
  new.agency_id := coalesce(new.agency_id, '354facdb-cce2-4eb0-a160-8454854e731a');
  return new;
end;
$$;

create or replace function public.assign_seller_lead_agency()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.agency_id is null and new.converted_listing_id is not null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.converted_listing_id;
  end if;
  new.agency_id := coalesce(new.agency_id, '354facdb-cce2-4eb0-a160-8454854e731a');
  return new;
end;
$$;

create or replace function public.assign_deal_agency()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.agency_id is null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.listing_id;
  end if;
  if new.agency_id is null then raise exception 'Deal requires a tenant-scoped listing'; end if;
  return new;
end;
$$;

revoke all on function public.assign_listing_agency() from public, anon, authenticated;
revoke all on function public.assign_buyer_lead_agency() from public, anon, authenticated;
revoke all on function public.assign_seller_lead_agency() from public, anon, authenticated;
revoke all on function public.assign_deal_agency() from public, anon, authenticated;

drop trigger if exists listings_assign_agency on public.listings;
create trigger listings_assign_agency before insert on public.listings for each row execute function public.assign_listing_agency();
drop trigger if exists buyer_leads_assign_agency on public.buyer_leads;
create trigger buyer_leads_assign_agency before insert on public.buyer_leads for each row execute function public.assign_buyer_lead_agency();
drop trigger if exists seller_leads_assign_agency on public.seller_leads;
create trigger seller_leads_assign_agency before insert on public.seller_leads for each row execute function public.assign_seller_lead_agency();
drop trigger if exists deals_assign_agency on public.deals;
create trigger deals_assign_agency before insert on public.deals for each row execute function public.assign_deal_agency();

-- Replace global authenticated policies with tenant-scoped policies.
drop policy if exists "listings: admin manages all" on public.listings;
drop policy if exists "listings: agent manages own" on public.listings;
drop policy if exists listings_authenticated_read on public.listings;
drop policy if exists listings_owner_update on public.listings;
create policy listings_agency_select on public.listings for select to authenticated using (public.is_agency_member(agency_id));
create policy listings_agency_insert on public.listings for insert to authenticated with check (public.is_agency_member(agency_id) and (agent_id = auth.uid() or public.is_agency_admin(agency_id)));
create policy listings_agency_update on public.listings for update to authenticated using (public.is_agency_member(agency_id) and (agent_id = auth.uid() or public.is_agency_admin(agency_id))) with check (public.is_agency_member(agency_id));
create policy listings_agency_delete on public.listings for delete to authenticated using (agent_id = auth.uid() or public.is_agency_admin(agency_id));

drop policy if exists "buyer_leads: agents and admin manage" on public.buyer_leads;
drop policy if exists "buyer_leads: agents and admin read" on public.buyer_leads;
drop policy if exists "buyer_leads: public can create" on public.buyer_leads;
drop policy if exists buyer_leads_auth_delete on public.buyer_leads;
drop policy if exists buyer_leads_auth_insert on public.buyer_leads;
drop policy if exists buyer_leads_auth_select on public.buyer_leads;
drop policy if exists buyer_leads_auth_update on public.buyer_leads;
create policy buyer_leads_public_insert on public.buyer_leads for insert to anon with check (agency_id = '354facdb-cce2-4eb0-a160-8454854e731a');
create policy buyer_leads_agency_manage on public.buyer_leads for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

drop policy if exists "seller_leads: agents and admin read/manage" on public.seller_leads;
drop policy if exists "seller_leads: agents and admin update" on public.seller_leads;
drop policy if exists "seller_leads: public can create" on public.seller_leads;
drop policy if exists seller_leads_auth_delete on public.seller_leads;
drop policy if exists seller_leads_auth_insert on public.seller_leads;
drop policy if exists seller_leads_auth_select on public.seller_leads;
drop policy if exists seller_leads_auth_update on public.seller_leads;
create policy seller_leads_public_insert on public.seller_leads for insert to anon with check (agency_id = '354facdb-cce2-4eb0-a160-8454854e731a');
create policy seller_leads_agency_manage on public.seller_leads for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

drop policy if exists "deals: agents and admin manage" on public.deals;
drop policy if exists deals_auth_delete on public.deals;
drop policy if exists deals_auth_insert on public.deals;
drop policy if exists deals_auth_select on public.deals;
drop policy if exists deals_auth_update on public.deals;
create policy deals_agency_manage on public.deals for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

drop policy if exists "profiles: select all" on public.profiles;
drop policy if exists profiles_owner_select_or_admin on public.profiles;
revoke all on public.profiles from anon;
create or replace function public.shares_agency_with(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() = target_profile_id or exists (
    select 1
    from public.agency_members caller
    join public.agency_members target on target.agency_id = caller.agency_id
    where caller.profile_id = auth.uid() and target.profile_id = target_profile_id
  );
$$;
revoke all on function public.shares_agency_with(uuid) from public, anon;
grant execute on function public.shares_agency_with(uuid) to authenticated;
create policy profiles_same_agency_select on public.profiles for select to authenticated using (public.shares_agency_with(id));

-- Privileged mutations now verify ownership and tenant membership.
create or replace function public.add_image_to_listing(listing_id uuid, image_url text, is_primary boolean default false)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare current_images text[];
begin
  if not exists (select 1 from public.listings listing where listing.id = listing_id and public.is_agency_member(listing.agency_id) and (listing.agent_id = auth.uid() or public.is_agency_admin(listing.agency_id))) then
    raise exception 'Not authorized for this listing';
  end if;
  select coalesce(image_urls, array[]::text[]) into current_images from public.listings where id = listing_id;
  update public.listings set image_urls = array_append(current_images, image_url), primary_image_url = case when is_primary or primary_image_url is null then image_url else primary_image_url end where id = listing_id;
  return found;
end;
$$;

create or replace function public.remove_image_from_listing(listing_id uuid, image_url text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare current_images text[]; new_images text[];
begin
  if not exists (select 1 from public.listings listing where listing.id = listing_id and public.is_agency_member(listing.agency_id) and (listing.agent_id = auth.uid() or public.is_agency_admin(listing.agency_id))) then
    raise exception 'Not authorized for this listing';
  end if;
  select image_urls into current_images from public.listings where id = listing_id;
  select coalesce(array_agg(url), array[]::text[]) into new_images from unnest(coalesce(current_images, array[]::text[])) url where url <> image_url;
  update public.listings set image_urls = new_images, primary_image_url = case when primary_image_url = image_url then new_images[1] else primary_image_url end where id = listing_id;
  return found;
end;
$$;

create or replace function public.set_primary_image(listing_id uuid, image_url text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.listings listing where listing.id = listing_id and public.is_agency_member(listing.agency_id) and (listing.agent_id = auth.uid() or public.is_agency_admin(listing.agency_id))) then
    raise exception 'Not authorized for this listing';
  end if;
  update public.listings set primary_image_url = image_url where id = listing_id and image_url = any(image_urls);
  return found;
end;
$$;

create or replace function public.get_listing_images(listing_id uuid)
returns table(image_urls text[], primary_image_url text, featured_image_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select listing.image_urls, listing.primary_image_url, listing.featured_image_url
  from public.listings listing
  where listing.id = listing_id and public.is_agency_member(listing.agency_id);
$$;

create or replace function public.update_profile_avatar(p_user_id uuid, p_avatar_url text, p_avatar_thumb_url text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id <> auth.uid() then raise exception 'Profiles may only update their own avatar'; end if;
  update public.profiles set avatar_url = p_avatar_url, avatar_thumb_url = coalesce(p_avatar_thumb_url, p_avatar_url) where id = p_user_id;
  return found;
end;
$$;

create or replace function public.get_profile_with_avatar(p_user_id uuid)
returns table(id uuid, email text, full_name text, role text, status text, avatar_url text, avatar_thumb_url text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select profile.id, profile.email, profile.full_name, profile.role, profile.status, profile.avatar_url, profile.avatar_thumb_url, profile.created_at
  from public.profiles profile
  where profile.id = p_user_id and public.shares_agency_with(profile.id);
$$;

create or replace function public.create_deal_from_lead(p_listing_id uuid, p_buyer_lead_id uuid, p_purchase_price numeric default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare listing_agency uuid; lead_agency uuid; new_deal_id uuid;
begin
  select agency_id into listing_agency from public.listings where id = p_listing_id;
  select agency_id into lead_agency from public.buyer_leads where id = p_buyer_lead_id;
  if listing_agency is null or lead_agency is null or listing_agency <> lead_agency or not public.is_agency_member(listing_agency) then
    raise exception 'Listing and buyer lead must belong to your agency';
  end if;
  insert into public.deals (agency_id, listing_id, buyer_lead_id, purchase_price, status)
  values (listing_agency, p_listing_id, p_buyer_lead_id, p_purchase_price, 'letter_of_intent') returning id into new_deal_id;
  return new_deal_id;
end;
$$;

revoke execute on function public.enforce_listing_approved_before_publish() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.prevent_role_self_escalation() from authenticated;

commit;
