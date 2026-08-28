--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: add_image_to_listing(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_image_to_listing(listing_id uuid, image_url text, is_primary boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: assign_buyer_lead_agency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_buyer_lead_agency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.agency_id is null and new.listing_id is not null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.listing_id;
  end if;
  new.agency_id := coalesce(new.agency_id, '354facdb-cce2-4eb0-a160-8454854e731a');
  return new;
end;
$$;


--
-- Name: assign_deal_agency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_deal_agency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.agency_id is null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.listing_id;
  end if;
  if new.agency_id is null then raise exception 'Deal requires a tenant-scoped listing'; end if;
  return new;
end;
$$;


--
-- Name: assign_listing_agency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_listing_agency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: assign_listing_ref(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_listing_ref() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  prefix text;
begin
  if new.listing_ref is null or new.listing_ref = '' then
    select coalesce(upper(regexp_replace(a.slug, '[^a-z0-9]', '', 'g')), '') into prefix
    from public.agencies a where a.id = new.agency_id;
    if prefix = '' or length(prefix) < 2 then
      prefix := 'CDX';
    else
      prefix := left(prefix, 3);
    end if;
    new.listing_ref := prefix || '-' || lpad(nextval('public.listing_ref_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;


--
-- Name: assign_seller_lead_agency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_seller_lead_agency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.agency_id is null and new.converted_listing_id is not null then
    select listing.agency_id into new.agency_id from public.listings listing where listing.id = new.converted_listing_id;
  end if;
  new.agency_id := coalesce(new.agency_id, '354facdb-cce2-4eb0-a160-8454854e731a');
  return new;
end;
$$;


--
-- Name: auto_process_financial_document(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_process_financial_document() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- Auto-set document type if not set
  IF NEW.document_type IS NULL AND NEW.file_name IS NOT NULL THEN
    NEW.document_type := public.detect_financial_document_type(NEW.file_name, '');
  END IF;
  
  -- Set processing status
  IF NEW.processing_status = 'pending' THEN
    NEW.processing_started_at := NOW();
    NEW.processing_status := 'processing';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: auto_set_primary_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_set_primary_image() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL AND array_length(NEW.image_urls, 1) > 0 THEN
    IF NEW.primary_image_url IS NULL OR NEW.primary_image_url = '' THEN
      NEW.primary_image_url = NEW.image_urls[1];
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: auto_tag_financial_category(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_tag_financial_category(file_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- Check for tax returns
  IF file_name ILIKE '%tax%' OR file_name ILIKE '%return%' OR file_name ILIKE '%1040%' OR file_name ILIKE '%1120%' THEN
    RETURN 'tax_return';
  -- Check for bank statements
  ELSIF file_name ILIKE '%bank%' OR (file_name ILIKE '%account%' AND file_name ILIKE '%statement%') THEN
    RETURN 'bank_statement';
  -- Check for P&L
  ELSIF file_name ILIKE '%p&l%' OR file_name ILIKE '%pnl%' OR file_name ILIKE '%profit%loss%' OR file_name ILIKE '%income statement%' THEN
    RETURN 'financial_statement';
  -- Check for balance sheet
  ELSIF file_name ILIKE '%balance sheet%' OR file_name ILIKE '%balance%' THEN
    RETURN 'financial_statement';
  -- Check for generated documents
  ELSIF file_name ILIKE '%recast%' OR file_name ILIKE '%bov%' OR file_name ILIKE '%cim%' OR file_name ILIKE '%bli%' THEN
    RETURN 'generated_document';
  -- Default
  ELSE
    RETURN 'other';
  END IF;
END;
$$;


--
-- Name: buyer_lead_insert_allowed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buyer_lead_insert_allowed(p_agency_id uuid, p_listing_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select p_agency_id = '354facdb-cce2-4eb0-a160-8454854e731a'
      or (p_listing_id is not null and exists (
            select 1 from public.listings l
            where l.id = p_listing_id
              and l.agency_id = p_agency_id
          ));
$$;


--
-- Name: check_professional_advertised(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_professional_advertised() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.advertised and not coalesce(new.pays_referral_fees, false) then
    raise exception 'Cannot advertise a professional who does not pay referral fees';
  end if;
  return new;
end;
$$;


--
-- Name: create_deal_from_lead(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_deal_from_lead(p_listing_id uuid, p_buyer_lead_id uuid, p_purchase_price numeric DEFAULT NULL::numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: detect_financial_document_type(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_financial_document_type(file_name text, file_content text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  content_lower TEXT;
BEGIN
  content_lower := LOWER(file_content);
 
  -- Tax Returns
  IF file_name ILIKE '%1040%' OR file_name ILIKE '%1120%' OR file_name ILIKE '%1065%' OR file_name ILIKE '%k-1%' THEN
    RETURN 'tax_return';
  ELSIF content_lower LIKE '%tax%return%' OR content_lower LIKE '%1040%' OR content_lower LIKE '%1120%' THEN
    RETURN 'tax_return';
 
  -- P&L Statements
  ELSIF file_name ILIKE '%p&l%' OR file_name ILIKE '%pnl%' OR file_name ILIKE '%profit%loss%' THEN
    RETURN 'profit_loss';
  ELSIF content_lower LIKE '%profit%loss%' OR content_lower LIKE '%income statement%' THEN
    RETURN 'profit_loss';
 
  -- Balance Sheets
  ELSIF file_name ILIKE '%balance%' AND file_name ILIKE '%sheet%' THEN
    RETURN 'balance_sheet';
  ELSIF content_lower LIKE '%balance sheet%' OR content_lower LIKE '%assets%liabilities%' THEN
    RETURN 'balance_sheet';
 
  -- Bank Statements
  ELSIF file_name ILIKE '%bank%statement%' THEN
    RETURN 'bank_statement';
  ELSIF content_lower LIKE '%bank%statement%' OR content_lower LIKE '%account%balance%' THEN
    RETURN 'bank_statement';
 
  -- Sales Reports
  ELSIF file_name ILIKE '%sales%' OR file_name ILIKE '%revenue%' THEN
    RETURN 'sales_report';
  ELSIF content_lower LIKE '%sales%revenue%' OR content_lower LIKE '%total sales%' THEN
    RETURN 'sales_report';
 
  -- AP Reports
  ELSIF file_name ILIKE '%accounts payable%' OR file_name ILIKE '%ap%' THEN
    RETURN 'accounts_payable';
  ELSIF content_lower LIKE '%accounts payable%' OR content_lower LIKE '%vendor%payable%' THEN
    RETURN 'accounts_payable';
 
  -- AR Reports
  ELSIF file_name ILIKE '%accounts receivable%' OR file_name ILIKE '%ar%' THEN
    RETURN 'accounts_receivable';
  ELSIF content_lower LIKE '%accounts receivable%' OR content_lower LIKE '%customer%receivable%' THEN
    RETURN 'accounts_receivable';
 
  -- Payroll Reports
  ELSIF file_name ILIKE '%payroll%' THEN
    RETURN 'payroll_report';
  ELSIF content_lower LIKE '%payroll%' OR content_lower LIKE '%employee%wages%' THEN
    RETURN 'payroll_report';
 
  -- Inventory Reports
  ELSIF file_name ILIKE '%inventory%' THEN
    RETURN 'inventory_report';
  ELSIF content_lower LIKE '%inventory%' OR content_lower LIKE '%stock%' THEN
    RETURN 'inventory_report';
 
  -- Cash Flow
  ELSIF file_name ILIKE '%cash flow%' OR file_name ILIKE '%cashflow%' THEN
    RETURN 'cash_flow';
  ELSIF content_lower LIKE '%cash flow%' THEN
    RETURN 'cash_flow';
 
  -- Financial Projections
  ELSIF file_name ILIKE '%projection%' OR file_name ILIKE '%forecast%' THEN
    RETURN 'financial_projection';
  ELSIF content_lower LIKE '%projection%' OR content_lower LIKE '%forecast%' THEN
    RETURN 'financial_projection';
 
  -- Business Plans
  ELSIF file_name ILIKE '%business plan%' THEN
    RETURN 'business_plan';
  ELSIF content_lower LIKE '%business plan%' THEN
    RETURN 'business_plan';
 
  -- Executive Summary
  ELSIF file_name ILIKE '%executive summary%' THEN
    RETURN 'executive_summary';
  ELSIF content_lower LIKE '%executive summary%' THEN
    RETURN 'executive_summary';
 
  -- Budget Reports
  ELSIF file_name ILIKE '%budget%' THEN
    RETURN 'budget_report';
  ELSIF content_lower LIKE '%budget%' THEN
    RETURN 'budget_report';
 
  -- Default
  ELSE
    RETURN 'other';
  END IF;
END;
$$;


--
-- Name: enforce_listing_approved_before_publish(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_listing_approved_before_publish() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.published = true then
    if not exists (
      select 1 from public.listings
      where id = new.listing_id and review_stage = 'approved'
    ) then
      raise exception 'Cannot publish listing to the public website until review_stage = approved (listing %)', new.listing_id;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: expire_featured_slots(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_featured_slots() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update public.listings l
  set is_featured = false, featured_until = null
  where l.is_featured = true
    and l.featured_until is not null
    and l.featured_until < now();
$$;


--
-- Name: extract_financial_data(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extract_financial_data(file_content text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
DECLARE
  result JSONB := '{}'::JSONB;
  revenue NUMERIC;
  expenses NUMERIC;
  ebitda NUMERIC;
  sde NUMERIC;
BEGIN
  -- Extract Revenue (look for common patterns)
  revenue := CAST(
    (SELECT regexp_matches(file_content, '(?:Revenue|Sales|Income)[:\s]+[$]?([0-9,]+\.?[0-9]*)', 'i'))[1] AS NUMERIC
  );
  IF revenue IS NOT NULL THEN
    result := jsonb_set(result, '{revenue}', to_jsonb(revenue));
  END IF;
  
  -- Extract Expenses
  expenses := CAST(
    (SELECT regexp_matches(file_content, '(?:Expenses|Costs)[:\s]+[$]?([0-9,]+\.?[0-9]*)', 'i'))[1] AS NUMERIC
  );
  IF expenses IS NOT NULL THEN
    result := jsonb_set(result, '{expenses}', to_jsonb(expenses));
  END IF;
  
  -- Extract EBITDA
  ebitda := CAST(
    (SELECT regexp_matches(file_content, '(?:EBITDA|Earnings Before)[:\s]+[$]?([0-9,]+\.?[0-9]*)', 'i'))[1] AS NUMERIC
  );
  IF ebitda IS NOT NULL THEN
    result := jsonb_set(result, '{ebitda}', to_jsonb(ebitda));
  END IF;
  
  -- Extract SDE
  sde := CAST(
    (SELECT regexp_matches(file_content, '(?:SDE|Seller Discretionary)[:\s]+[$]?([0-9,]+\.?[0-9]*)', 'i'))[1] AS NUMERIC
  );
  IF sde IS NOT NULL THEN
    result := jsonb_set(result, '{sde}', to_jsonb(sde));
  END IF;
  
  RETURN result;
END;
$_$;


--
-- Name: financial_history_band(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financial_history_band(p_listing_id uuid) RETURNS TABLE(declared_years integer, available_years integer, band text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    coalesce(max(fd.operating_years), 0)::int as declared_years,
    count(distinct fd.fiscal_year)::int as available_years,
    case
      when count(distinct fd.fiscal_year) >= 3 then 'established'
      when count(distinct fd.fiscal_year) >= 1 then 'limited'
      else 'none'
    end as band
  from public.financial_documents fd
  where fd.listing_id = p_listing_id
    and fd.category <> 'generated_document';
$$;


--
-- Name: get_current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_role() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


--
-- Name: get_financial_ledger(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_financial_ledger(p_listing_id uuid) RETURNS TABLE(fiscal_year integer, month integer, revenue numeric, expenses numeric, net numeric, source text, reviewed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select fl.fiscal_year, fl.month, fl.revenue, fl.expenses, fl.net, fl.source, fl.reviewed_at
  from public.financial_ledger fl
  where fl.listing_id = p_listing_id
  order by fl.fiscal_year desc, fl.month asc;
$$;


--
-- Name: get_listing_images(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_listing_images(listing_id uuid) RETURNS TABLE(image_urls text[], primary_image_url text, featured_image_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select listing.image_urls, listing.primary_image_url, listing.featured_image_url
  from public.listings listing
  where listing.id = listing_id and public.is_agency_member(listing.agency_id);
$$;


--
-- Name: get_off_market_feed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_off_market_feed(p_profile_id uuid) RETURNS TABLE(listing_id uuid, slug text, public_title text, industry text, sub_industry text, location_general text, asking_price numeric, annual_revenue numeric, sde numeric, ebitda numeric, gallery_json jsonb, agency_name text, contact_phone text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    l.id,
    coalesce(pl.slug, concat('offmarket-', l.id::text)),
    coalesce(nullif(pl.public_title, ''), nullif(l.headline, ''), concat(l.industry, ' Business Opportunity')),
    l.industry,
    l.sub_industry,
    l.location_general,
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.ebitda,
    pl.gallery_json,
    a.name,
    l.contact_phone
  from public.listings l
  left join public.public_listings pl on pl.listing_id = l.id
  left join public.agencies a on a.id = l.agency_id
  where coalesce(l.off_market, false) = true
    and l.status = 'active'
    and l.review_stage = 'approved'
    and (
      -- Verified buyer (paid pass or POF-verified profile)
      exists (
        select 1 from public.profiles p
        where p.id = p_profile_id and p.verified_buyer = true
      )
      or exists (
        select 1 from public.buyer_subscriptions bs
        where bs.profile_id = p_profile_id and bs.status = 'active'
      )
      or exists (
        select 1 from public.agency_members m
        where m.profile_id = p_profile_id
      )
    )
  order by l.updated_at desc;
$$;


--
-- Name: get_profile_with_avatar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_with_avatar(p_user_id uuid) RETURNS TABLE(id uuid, email text, full_name text, role text, status text, avatar_url text, avatar_thumb_url text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select profile.id, profile.email, profile.full_name, profile.role, profile.status, profile.avatar_url, profile.avatar_thumb_url, profile.created_at
  from public.profiles profile
  where profile.id = p_user_id and public.shares_agency_with(profile.id);
$$;


--
-- Name: get_public_listing_feed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_listing_feed(p_slug text DEFAULT NULL::text, p_agency text DEFAULT NULL::text) RETURNS TABLE(listing_id uuid, slug text, public_title text, public_summary text, industry text, sub_industry text, location_general text, asking_price numeric, annual_revenue numeric, sde numeric, ebitda numeric, public_highlights jsonb, gallery_json jsonb, is_featured boolean, is_confidential boolean, published_at timestamp with time zone, show_financials boolean, contact_phone text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    l.id,
    pl.slug,
    coalesce(nullif(pl.public_title, ''), nullif(l.headline, ''), concat(l.industry, ' Business Opportunity')),
    pl.public_summary,
    l.industry,
    l.sub_industry,
    case when pl.location_exposure = 'general' then l.location_general else null end,
    case when pl.show_financials then l.asking_price else null end,
    case when pl.show_financials then l.annual_revenue else null end,
    case when pl.show_financials then l.sde else null end,
    case when pl.show_financials then l.ebitda else null end,
    pl.public_highlights,
    pl.gallery_json,
    pl.is_featured,
    pl.is_confidential,
    pl.published_at,
    pl.show_financials,
    l.contact_phone
  from public.public_listings pl
  join public.listings l on l.id = pl.listing_id
  where pl.published = true
    and pl.seller_approved_at is not null
    and (pl.approval_expires_at is null or pl.approval_expires_at > now())
    and l.status = 'active'
    and l.review_stage = 'approved'
    and coalesce(l.off_market, false) = false
    and (p_slug is null or pl.slug = p_slug or l.id::text = p_slug)
  order by pl.is_featured desc, pl.published_at desc;
$$;


--
-- Name: get_public_sold_listings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_sold_listings() RETURNS TABLE(listing_id uuid, industry text, sub_industry text, location_general text, asking_price numeric, sde numeric, multiple numeric, closed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    l.id,
    l.industry,
    l.sub_industry,
    l.location_general,
    l.asking_price,
    l.sde,
    case when l.sde is not null and l.sde > 0 then round(l.asking_price / l.sde, 2) else null end,
    l.updated_at
  from public.listings l
  where l.status = 'closed'
    and l.agency_id is not null
  order by l.updated_at desc
  limit 50;
$$;


--
-- Name: get_public_sold_listings(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_sold_listings(p_agency text DEFAULT NULL::text) RETURNS TABLE(listing_id uuid, industry text, sub_industry text, location_general text, asking_price numeric, sde numeric, multiple numeric, closed_at timestamp with time zone, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    l.id,
    l.industry,
    l.sub_industry,
    l.location_general,
    l.asking_price,
    l.sde,
    case when l.sde is not null and l.sde > 0 then round(l.asking_price / l.sde, 2) else null end,
    l.updated_at,
    l.published_at
  from public.listings l
  where l.status = 'closed'
    and l.agency_id is not null
    and (
      p_agency is null
      or l.agency_id = (
        select a.id from public.agencies a
        where a.slug = p_agency or a.domain = p_agency or a.custom_domain = p_agency
        limit 1
      )
    )
  order by l.updated_at desc
  limit 50;
$$;


--
-- Name: guess_financial_category(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guess_financial_category(file_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select case
    when file_name ilike '%tax%' or file_name ilike '%return%' or file_name ilike '%1040%'
         or file_name ilike '%1120%' or file_name ilike '%k-1%' or file_name ilike '%k1%'
      then 'tax_return'
    when file_name ilike '%bank%' or (file_name ilike '%account%' and file_name ilike '%statement%')
      then 'bank_statement'
    when file_name ilike '%p&l%' or file_name ilike '%pnl%' or file_name ilike '%profit%loss%'
         or file_name ilike '%income statement%' or file_name ilike '%balance sheet%'
      then 'financial_statement'
    when file_name ilike '%cim%' or file_name ilike '%bov%' or file_name ilike '%recast%' or file_name ilike '%bli%'
      then 'generated_document'
    else 'other'
  end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  assigned_role text := 'buyer';
begin
  if exists (select 1 from public.pending_agent_invites where email = new.email) then
    assigned_role := 'agent';
    delete from public.pending_agent_invites where email = new.email;
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, assigned_role);

  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'agent') = 'admin'
$$;


--
-- Name: is_agency_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_agency_admin(target_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and profile_id = auth.uid()
      and (role = 'admin' or is_owner = true)
  );
$$;


--
-- Name: is_agency_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_agency_member(target_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and profile_id = auth.uid()
  );
$$;


--
-- Name: is_broker_or_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_broker_or_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'agent'
  ) in ('broker', 'admin');
$$;


--
-- Name: match_buyers_for_listing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_buyers_for_listing() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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


--
-- Name: prevent_role_self_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_role_self_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_is_admin boolean;
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    select coalesce((select role from public.profiles where id = auth.uid()), 'agent') = 'admin'
      into caller_is_admin;
    if not coalesce(caller_is_admin, false) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: process_scheduled_publishes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_scheduled_publishes() RETURNS TABLE(processed integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: remove_image_from_listing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_image_from_listing(listing_id uuid, image_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: seed_email_templates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_email_templates(p_agency_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  inserted integer := 0;
begin
  insert into public.email_templates (agency_id, name, category, subject, body, variables, is_system) values
    (p_agency_id, 'Initial introduction', 'intro',
     'Introduction — {{business_name}}',
     'Dear {{recipient_name}},\n\nThank you for reaching out regarding {{business_name}}. I''d love to learn more about your goals and walk you through how we can help.\n\nWould you be available for a quick call this week?\n\nBest regards,\n{{agent_name}}\n{{agent_phone}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"},{"name":"agent_phone","label":"Your phone"}]'::jsonb, true),
    (p_agency_id, 'NDA follow-up', 'nda',
     'Following up — NDA for {{business_name}}',
     'Dear {{recipient_name}},\n\nI wanted to follow up on the NDA for {{business_name}}. Once signed, you''ll receive access to the confidential data room with the full financial details.\n\nIf you have any questions, I''m here to help.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Offer presentation', 'offer',
     'Offer received for {{business_name}}',
     'Dear {{recipient_name}},\n\nWe have received an offer of {{offer_amount}} for {{business_name}}.\n\nI''ll walk you through the terms and answer any questions before you decide.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"offer_amount","label":"Offer amount"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Counter-offer', 'counter',
     'Counter-offer for {{business_name}}',
     'Dear {{recipient_name}},\n\nThe buyer has responded with a counter-offer of {{counter_amount}}.\n\nLet''s review the terms together to see if it works for you.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"counter_amount","label":"Counter amount"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Buyer welcome', 'welcome',
     'Welcome — let''s find your business',
     'Dear {{recipient_name}},\n\nWelcome! We''re excited to help you find the right business. I''ll keep you updated as matching opportunities become available.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Seller valuation follow-up', 'valuation',
     'Your business valuation — {{business_name}}',
     'Dear {{recipient_name}},\n\nBased on our analysis, {{business_name}} may be worth an estimated {{valuation_range}}.\n\nI''d love to walk you through the details and discuss next steps.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"valuation_range","label":"Valuation range"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Check-in', 'follow_up',
     'Checking in — {{business_name}}',
     'Dear {{recipient_name}},\n\nJust checking in on {{business_name}}. Is there anything you need from us, or any updates on your end?\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true)
  on conflict (agency_id, name) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;


--
-- Name: set_primary_image(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_primary_image(listing_id uuid, image_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (select 1 from public.listings listing where listing.id = listing_id and public.is_agency_member(listing.agency_id) and (listing.agent_id = auth.uid() or public.is_agency_admin(listing.agency_id))) then
    raise exception 'Not authorized for this listing';
  end if;
  update public.listings set primary_image_url = image_url where id = listing_id and image_url = any(image_urls);
  return found;
end;
$$;


--
-- Name: shares_agency_with(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shares_agency_with(target_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select auth.uid() = target_profile_id or exists (
    select 1
    from public.agency_members caller
    join public.agency_members target on target.agency_id = caller.agency_id
    where caller.profile_id = auth.uid() and target.profile_id = target_profile_id
  );
$$;


--
-- Name: update_deal_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_deal_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_financial_document_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_financial_document_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- Auto-set deal_name if not provided
  IF NEW.deal_name IS NULL AND NEW.deal_id IS NOT NULL THEN
    SELECT title INTO NEW.deal_name FROM public.deals WHERE id = NEW.deal_id;
  END IF;

  -- Auto-set listing_name if not provided
  IF NEW.listing_name IS NULL AND NEW.listing_id IS NOT NULL THEN
    SELECT business_name INTO NEW.listing_name FROM public.listings WHERE id = NEW.listing_id;
  END IF;

  -- Auto-set file_kind based on mime_type
  IF NEW.mime_type IS NOT NULL THEN
    IF NEW.mime_type LIKE '%pdf%' THEN
      NEW.file_kind := 'pdf';
    ELSIF NEW.mime_type LIKE '%excel%' OR NEW.mime_type LIKE '%spreadsheet%' THEN
      NEW.file_kind := 'excel';
    ELSIF NEW.mime_type LIKE '%word%' OR NEW.mime_type LIKE '%document%' THEN
      NEW.file_kind := 'word';
    ELSIF NEW.mime_type LIKE '%image%' THEN
      NEW.file_kind := 'image';
    END IF;
  END IF;

  -- Auto-tag category if not set
  IF NEW.category = 'other' AND NEW.file_name IS NOT NULL THEN
    NEW.category := public.auto_tag_financial_category(NEW.file_name);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_listing_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_listing_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_profile_avatar(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_profile_avatar(p_user_id uuid, p_avatar_url text, p_avatar_thumb_url text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_user_id <> auth.uid() then raise exception 'Profiles may only update their own avatar'; end if;
  update public.profiles set avatar_url = p_avatar_url, avatar_thumb_url = coalesce(p_avatar_thumb_url, p_avatar_url) where id = p_user_id;
  return found;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: financial_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    fiscal_year integer NOT NULL,
    month integer NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    expenses numeric DEFAULT 0 NOT NULL,
    net numeric DEFAULT 0 NOT NULL,
    source text DEFAULT 'extraction'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_ledger_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: upsert_ledger_month(uuid, integer, integer, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_ledger_month(p_listing_id uuid, p_fiscal_year integer, p_month integer, p_revenue numeric, p_expenses numeric, p_source text DEFAULT 'manual'::text) RETURNS public.financial_ledger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  out_row public.financial_ledger;
begin
  insert into public.financial_ledger (listing_id, fiscal_year, month, revenue, expenses, net, source, reviewed_by, reviewed_at)
  values (
    p_listing_id, p_fiscal_year, p_month,
    p_revenue, p_expenses,
    p_revenue - p_expenses,
    p_source,
    auth.uid(),
    now()
  )
  on conflict (listing_id, fiscal_year, month)
  do update set
    revenue = excluded.revenue,
    expenses = excluded.expenses,
    net = excluded.revenue - excluded.expenses,
    source = excluded.source,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;


--
-- Name: upsert_ledger_year(uuid, integer, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_ledger_year(p_listing_id uuid, p_fiscal_year integer, p_revenue numeric, p_expenses numeric, p_source text DEFAULT 'extraction'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m int;
  done int := 0;
begin
  for m in 1..12 loop
    perform public.upsert_ledger_month(p_listing_id, p_fiscal_year, m, p_revenue / 12.0, p_expenses / 12.0, p_source);
    done := done + 1;
  end loop;
  return done;
end;
$$;


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    business_name text NOT NULL,
    headline text DEFAULT ''::text NOT NULL,
    industry text,
    location_general text,
    description text,
    asking_price numeric,
    annual_revenue numeric,
    sde numeric,
    ebitda numeric,
    inventory_value numeric,
    ffe_value numeric,
    real_estate_included boolean DEFAULT false,
    reason_for_sale text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_urls text[] DEFAULT '{}'::text[],
    primary_image_url text,
    featured_image_url text,
    fts_document tsvector,
    review_stage text DEFAULT 'draft'::text NOT NULL,
    property_value numeric,
    property_description text,
    square_footage numeric,
    land_acres numeric,
    year_built integer,
    property_address text,
    property_city text,
    property_state text,
    property_zip text,
    num_employees integer,
    num_owners integer,
    business_square_footage numeric,
    lease_years_remaining numeric,
    monthly_rent numeric,
    total_value numeric GENERATED ALWAYS AS ((COALESCE(asking_price, (0)::numeric) + COALESCE(property_value, (0)::numeric))) STORED,
    business_type text,
    sub_industry text,
    property_type text,
    real_estate_asking_price numeric,
    year_established integer,
    hours_of_operation text,
    growth_potential text,
    competition text,
    market_position text,
    furniture_and_equipment_included boolean DEFAULT false NOT NULL,
    inventory_included boolean DEFAULT false NOT NULL,
    bli_anonymize boolean DEFAULT false NOT NULL,
    num_employees_ft integer,
    num_employees_pt integer,
    num_employees_contractor integer,
    is_absentee_owner boolean DEFAULT false NOT NULL,
    is_relocatable boolean DEFAULT false NOT NULL,
    is_home_based boolean DEFAULT false NOT NULL,
    is_franchise boolean DEFAULT false NOT NULL,
    website text,
    website_confidential boolean DEFAULT false NOT NULL,
    bizbuysell_uploaded boolean DEFAULT false NOT NULL,
    bizbuysell_uploaded_by uuid,
    bizbuysell_uploaded_at timestamp with time zone,
    agency_id uuid NOT NULL,
    established_year integer,
    employees_full_time integer,
    employees_part_time integer,
    owner_hours_weekly numeric,
    growth_opportunities text,
    competitive_advantages text,
    customer_concentration text,
    facilities_summary text,
    lease_monthly numeric,
    lease_expires_on date,
    seller_financing_available boolean DEFAULT false NOT NULL,
    financing_notes text,
    transition_support text,
    training_period_weeks integer,
    confidentiality_level text DEFAULT 'anonymous'::text NOT NULL,
    intake_source text DEFAULT 'broker_manual'::text NOT NULL,
    ai_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_readiness_score integer DEFAULT 0 NOT NULL,
    compliance_status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    commission_split_agent numeric,
    commission_split_brokerage numeric,
    listing_ref text,
    country_code text,
    currency_code text DEFAULT 'USD'::text NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    featured_until timestamp with time zone,
    publish_at timestamp with time zone,
    vetted boolean DEFAULT false NOT NULL,
    published_by uuid,
    published_at timestamp with time zone,
    flagged boolean DEFAULT false NOT NULL,
    flag_reasons text[] DEFAULT '{}'::text[] NOT NULL,
    sba_qualified boolean DEFAULT false NOT NULL,
    is_off_market boolean DEFAULT false,
    lease_square_feet integer,
    ffe_included boolean DEFAULT false NOT NULL,
    goodwill_included boolean DEFAULT false NOT NULL,
    asset_sale boolean DEFAULT true NOT NULL,
    portal_token text,
    moderation_reason text,
    moderated_by uuid,
    moderated_at timestamp with time zone,
    contact_phone text,
    off_market boolean DEFAULT false NOT NULL,
    competitive_board_enabled boolean DEFAULT false NOT NULL,
    competitive_board_consented_at timestamp with time zone,
    revenue_year_1 numeric(14,2),
    revenue_year_2 numeric(14,2),
    revenue_year_3 numeric(14,2),
    financials_status text DEFAULT 'missing'::text NOT NULL,
    financials_doc_paths text[],
    financials_submitted_at timestamp with time zone,
    legitimacy_score integer,
    legitimacy_verdict text DEFAULT 'pending'::text NOT NULL,
    ai_reviewed_at timestamp with time zone,
    owner_email text,
    attestation_accepted_at timestamp with time zone,
    attestation_ip text,
    attestation_text text,
    seller_verified boolean DEFAULT false NOT NULL,
    CONSTRAINT listings_ai_readiness_score_check CHECK (((ai_readiness_score >= 0) AND (ai_readiness_score <= 100))),
    CONSTRAINT listings_confidentiality_level_check CHECK ((confidentiality_level = ANY (ARRAY['anonymous'::text, 'qualified_buyers'::text, 'broker_only'::text]))),
    CONSTRAINT listings_financials_status_check CHECK ((financials_status = ANY (ARRAY['missing'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT listings_intake_source_check CHECK ((intake_source = ANY (ARRAY['broker_manual'::text, 'seller_self_service'::text, 'ai_phone'::text, 'import'::text]))),
    CONSTRAINT listings_legitimacy_verdict_check CHECK ((legitimacy_verdict = ANY (ARRAY['pending'::text, 'auto_approved'::text, 'broker_review'::text, 'rejected'::text]))),
    CONSTRAINT listings_review_stage_check CHECK ((review_stage = ANY (ARRAY['draft'::text, 'internal_review'::text, 'approved'::text]))),
    CONSTRAINT listings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'approved'::text, 'rejected'::text, 'under_contract'::text, 'sold'::text, 'pending_sale'::text, 'under_loi'::text, 'closed'::text, 'withdrawn'::text, 'deleted'::text])))
);


--
-- Name: COLUMN listings.num_employees; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.num_employees IS 'Total employees currently working in the business (excluding owners).';


--
-- Name: COLUMN listings.num_owners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.num_owners IS 'Number of owners actively working in the business day-to-day.';


--
-- Name: COLUMN listings.business_square_footage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.business_square_footage IS 'Square footage of the business''s operating space (leased or owned) — independent of real_estate_included.';


--
-- Name: COLUMN listings.lease_years_remaining; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.lease_years_remaining IS 'Years remaining on the current lease, when the business leases its space (real_estate_included = false).';


--
-- Name: COLUMN listings.monthly_rent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.monthly_rent IS 'Current monthly rent/lease payment, when the business leases its space.';


--
-- Name: COLUMN listings.business_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.business_type IS 'Broad category (e.g. Retail, Restaurants & Food, Automotive) — distinct from the more specific `industry` field, matching a BizBuySell-style category/sub-category split.';


--
-- Name: COLUMN listings.sub_industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.sub_industry IS 'Finer-grained classification within `industry`.';


--
-- Name: COLUMN listings.real_estate_asking_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.real_estate_asking_price IS 'What the real estate is being asked for, if priced separately from the business (distinct from property_value, an estimate/appraisal).';


--
-- Name: COLUMN listings.bli_anonymize; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.bli_anonymize IS 'When true, generateBliContent() (lib/bli.ts) shows the confidential headline instead of the real business name. Does not affect CIM/BOV, which are only released to NDA''d buyers.';


--
-- Name: COLUMN listings.num_employees_ft; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.num_employees_ft IS 'Full-time non-owner employees. num_employees is auto-summed from ft+pt+contractor when any of the three are set.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'buyer'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    avatar_thumb_url text,
    email_settings jsonb,
    license_type text,
    license_state text,
    license_country text DEFAULT 'US'::text,
    license_number text,
    license_expiry date,
    license_verified boolean DEFAULT false NOT NULL,
    verified_buyer boolean DEFAULT false NOT NULL,
    phone text,
    phone_verified_at timestamp with time zone,
    profile_completed_at timestamp with time zone,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'broker'::text, 'agent'::text, 'associate'::text, 'buyer'::text, 'owner'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


--
-- Name: active_listings_with_agent; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_listings_with_agent WITH (security_invoker='true') AS
 SELECT l.id,
    l.agent_id,
    l.business_name,
    l.headline,
    l.industry,
    l.location_general,
    l.description,
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.ebitda,
    l.inventory_value,
    l.ffe_value,
    l.real_estate_included,
    l.reason_for_sale,
    l.status,
    l.created_at,
    l.updated_at,
    l.image_urls,
    l.primary_image_url,
    l.featured_image_url,
    p.full_name AS agent_name,
    p.email AS agent_email
   FROM (public.listings l
     JOIN public.profiles p ON ((l.agent_id = p.id)))
  WHERE (l.status = 'active'::text);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    related_type text NOT NULL,
    related_id uuid NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    due_date date,
    done boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activities_related_type_check CHECK ((related_type = ANY (ARRAY['buyer_lead'::text, 'seller_lead'::text, 'contact_request'::text, 'listing'::text]))),
    CONSTRAINT activities_type_check CHECK ((type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, 'meeting'::text, 'task'::text])))
);


--
-- Name: ad_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_key text NOT NULL,
    advertiser text NOT NULL,
    body text NOT NULL,
    url text NOT NULL,
    badge text DEFAULT 'Sponsored'::text NOT NULL,
    starts_at date DEFAULT CURRENT_DATE NOT NULL,
    ends_at date,
    active boolean DEFAULT true NOT NULL,
    monthly_fee_cents integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    target_label text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    domain text,
    brand_color text DEFAULT '#1a1a2e'::text,
    accent_color text DEFAULT '#c9a84c'::text,
    logo_url text,
    about text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_domain text,
    copyright_name text,
    default_agent_split numeric DEFAULT 50 NOT NULL,
    listing_approval_required boolean DEFAULT true NOT NULL,
    compliance_review_required boolean DEFAULT true NOT NULL,
    require_2fa boolean DEFAULT false NOT NULL,
    plan_type text,
    trial_start_date timestamp with time zone,
    trial_end_date timestamp with time zone,
    grace_end_date timestamp with time zone,
    trial_active boolean DEFAULT false,
    paid_plan_active boolean DEFAULT false,
    phone text,
    email text,
    locked_at timestamp with time zone,
    archive_at timestamp with time zone,
    licensed_at timestamp with time zone
);


--
-- Name: agency_ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_ai_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    purpose text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    credential_reference text,
    enabled boolean DEFAULT true NOT NULL,
    monthly_budget_cents integer,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agency_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    profile_id uuid,
    role text DEFAULT 'broker'::text NOT NULL,
    is_owner boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    commission_split numeric,
    hiring_status text DEFAULT 'active'::text NOT NULL,
    training_required boolean DEFAULT true NOT NULL,
    certification_status text DEFAULT 'pending'::text NOT NULL,
    available_from_hour integer DEFAULT 9,
    available_to_hour integer DEFAULT 21,
    timezone text DEFAULT 'America/New_York'::text
);


--
-- Name: agency_onboarding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_onboarding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    owner_email text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    plan_type text,
    amount_paid integer,
    payment_method text,
    current_step integer DEFAULT 0 NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    invite_sent_at timestamp with time zone,
    activated_at timestamp with time zone,
    completed_at timestamp with time zone,
    week_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agency_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_settings (
    agency_id uuid NOT NULL,
    custom_domain text,
    deepseek_api_key text,
    deepseek_base_url text DEFAULT 'https://api.deepseek.com'::text,
    supabase_project_url text,
    supabase_anon_key text,
    supabase_service_key text,
    stripe_secret_key text,
    stripe_webhook_secret text,
    ai_provider text DEFAULT 'deepseek'::text NOT NULL,
    ai_model text DEFAULT 'deepseek-v4-flash'::text,
    platform_name text,
    support_email text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    financial_intelligence_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: agency_site_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_site_themes (
    agency_id uuid NOT NULL,
    custom_domain text,
    logo_url text,
    favicon_url text,
    primary_color text DEFAULT '#102a43'::text NOT NULL,
    secondary_color text DEFAULT '#2563eb'::text NOT NULL,
    accent_color text DEFAULT '#38bdf8'::text NOT NULL,
    heading_font text DEFAULT 'system'::text NOT NULL,
    body_font text DEFAULT 'system'::text NOT NULL,
    hero_style text DEFAULT 'editorial'::text NOT NULL,
    listing_card_style text DEFAULT 'intelligence'::text NOT NULL,
    business_model text DEFAULT 'full_service_brokerage'::text NOT NULL,
    navigation jsonb DEFAULT '[]'::jsonb NOT NULL,
    homepage_sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    legal_disclosures jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agency_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listings_used integer DEFAULT 0 NOT NULL,
    leads_used integer DEFAULT 0 NOT NULL,
    deals_used integer DEFAULT 0 NOT NULL,
    storage_used bigint DEFAULT 0 NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    type text DEFAULT 'ic'::text NOT NULL,
    signed_at timestamp with time zone,
    expires_at timestamp with time zone,
    document_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    experience text,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    package_id uuid,
    desired_start_date date,
    notes text
);


--
-- Name: agent_contact_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_contact_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text,
    email text,
    phone text,
    message text,
    preferred_agent uuid,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_contact_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'closed'::text])))
);


--
-- Name: agent_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    period text,
    total_listings integer DEFAULT 0 NOT NULL,
    total_deals integer DEFAULT 0 NOT NULL,
    total_commission numeric DEFAULT 0 NOT NULL,
    avg_time_to_close integer,
    conversion_rate numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_performance_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_performance_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    listing_quality_score integer DEFAULT 0 NOT NULL,
    response_time_score integer DEFAULT 0 NOT NULL,
    compliance_score integer DEFAULT 0 NOT NULL,
    training_score integer DEFAULT 0 NOT NULL,
    client_satisfaction_score integer DEFAULT 0 NOT NULL,
    revenue_generated numeric DEFAULT 0 NOT NULL,
    listings_approved integer DEFAULT 0 NOT NULL,
    deals_closed integer DEFAULT 0 NOT NULL,
    coaching_plan jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    requested_by uuid,
    assigned_to uuid,
    deal_twin_id uuid,
    call_session_id uuid,
    action_type text NOT NULL,
    title text NOT NULL,
    description text,
    risk_level text DEFAULT 'low'::text NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    output jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    model text,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT ai_actions_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT ai_actions_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'running'::text, 'completed'::text, 'rejected'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: ai_agent_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    agent_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    action_id uuid NOT NULL,
    requested_from uuid,
    decided_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    decision_note text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    CONSTRAINT ai_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: ai_prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    name text NOT NULL,
    purpose text NOT NULL,
    model_role text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    prompt text NOT NULL,
    tool_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_prompt_versions_model_role_check CHECK ((model_role = ANY (ARRAY['deepseek'::text, 'claude'::text, 'gpt'::text, 'provider_neutral'::text])))
);


--
-- Name: api_keys_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_name text NOT NULL,
    provider text NOT NULL,
    website_url text,
    purpose text,
    status text DEFAULT 'configured'::text NOT NULL,
    masked_tail text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    profile_id uuid,
    title text NOT NULL,
    body text,
    kind text DEFAULT 'info'::text NOT NULL,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    assigned_to uuid,
    created_by uuid,
    listing_id uuid,
    deal_id uuid,
    seller_lead_id uuid,
    title text NOT NULL,
    appointment_type text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    location_type text DEFAULT 'phone'::text NOT NULL,
    location text,
    attendee_name text,
    attendee_email text,
    attendee_phone text,
    notes text,
    source text DEFAULT 'manual'::text NOT NULL,
    external_event_id text,
    confirmation_sent_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_appointment_type_check CHECK ((appointment_type = ANY (ARRAY['listing'::text, 'buyer'::text, 'valuation'::text, 'due_diligence'::text, 'closing'::text, 'general'::text]))),
    CONSTRAINT appointments_check CHECK ((ends_at > starts_at)),
    CONSTRAINT appointments_location_type_check CHECK ((location_type = ANY (ARRAY['phone'::text, 'video'::text, 'office'::text, 'onsite'::text, 'other'::text]))),
    CONSTRAINT appointments_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'ai_phone'::text, 'portal'::text, 'calendar_sync'::text, 'api'::text]))),
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['tentative'::text, 'scheduled'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: auto_generation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_generation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financial_document_id uuid,
    generation_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    result_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auto_generation_logs_generation_type_check CHECK ((generation_type = ANY (ARRAY['recast'::text, 'bov'::text, 'cim'::text, 'bli'::text]))),
    CONSTRAINT auto_generation_logs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: bbs_syncs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbs_syncs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    provider text DEFAULT 'bizbuysell'::text NOT NULL,
    external_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_sync_at timestamp with time zone,
    payload_json jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bli_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bli_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    version_number integer DEFAULT 1 NOT NULL,
    content jsonb,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT bli_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'final'::text])))
);


--
-- Name: bov_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bov_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    version_number integer DEFAULT 1 NOT NULL,
    content jsonb,
    valuation_multiple numeric,
    valuation_amount numeric,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    version integer DEFAULT 1 NOT NULL,
    title text,
    content_json jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bov_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'final'::text])))
);


--
-- Name: broker_financial_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broker_financial_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    listing_id uuid,
    file_name text,
    file_url text,
    file_type text DEFAULT 'other'::text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: broker_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broker_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    url text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: broker_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broker_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    agency_id uuid,
    public_name text,
    title text,
    bio text,
    avatar_url text,
    phone text,
    email_public text,
    linkedin text,
    is_public boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    service_area text,
    expertise text[] DEFAULT '{}'::text[] NOT NULL,
    industries text[] DEFAULT '{}'::text[] NOT NULL,
    markets text[] DEFAULT '{}'::text[] NOT NULL,
    years_experience integer,
    credentials text[] DEFAULT '{}'::text[] NOT NULL,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    closed_deals_count integer DEFAULT 0 NOT NULL,
    transaction_value_total numeric DEFAULT 0 NOT NULL,
    booking_url text,
    service_areas text[] DEFAULT '{}'::text[] NOT NULL,
    profile_status text DEFAULT 'draft'::text NOT NULL,
    licensed_states text[],
    license_attested_at timestamp with time zone,
    is_featured boolean DEFAULT false NOT NULL
);


--
-- Name: buyer_bookmarked_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_bookmarked_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    buyer_profile_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buyer_engagement_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_engagement_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    buyer_lead_id uuid,
    data_room_buyer_id uuid,
    fit_score integer DEFAULT 0 NOT NULL,
    engagement_score integer DEFAULT 0 NOT NULL,
    qualification_score integer DEFAULT 0 NOT NULL,
    closing_probability integer DEFAULT 0 NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    recommended_action text,
    last_scored_at timestamp with time zone,
    CONSTRAINT buyer_engagement_scores_closing_probability_check CHECK (((closing_probability >= 0) AND (closing_probability <= 100))),
    CONSTRAINT buyer_engagement_scores_engagement_score_check CHECK (((engagement_score >= 0) AND (engagement_score <= 100))),
    CONSTRAINT buyer_engagement_scores_fit_score_check CHECK (((fit_score >= 0) AND (fit_score <= 100))),
    CONSTRAINT buyer_engagement_scores_qualification_score_check CHECK (((qualification_score >= 0) AND (qualification_score <= 100)))
);


--
-- Name: buyer_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    full_name text,
    email text,
    phone text,
    budget_range text,
    industries_interest text,
    message text,
    status text DEFAULT 'new'::text NOT NULL,
    ai_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_name text,
    company text,
    industry_interest text,
    notes text,
    fts_document tsvector,
    desired_business_type text,
    funds_available numeric,
    financing_method text,
    preferred_location text,
    zip text,
    timeframe text,
    agency_id uuid NOT NULL,
    offer_amount numeric,
    source text,
    verified_buyer boolean DEFAULT false,
    CONSTRAINT buyer_leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'qualifying'::text, 'qualified'::text, 'handed_off'::text, 'not_a_fit'::text])))
);


--
-- Name: buyer_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    buyer_name text,
    buyer_email text,
    buyer_phone text,
    buyer_type text DEFAULT 'individual'::text,
    nda_signed boolean DEFAULT false NOT NULL,
    nda_signed_at timestamp with time zone,
    financial_proof_uploaded boolean DEFAULT false NOT NULL,
    financial_proof_url text,
    financial_qualified boolean DEFAULT false NOT NULL,
    qualification_notes text,
    is_primary_buyer boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nda_document_path text,
    nda_document_name text,
    nda_document_uploaded_at timestamp with time zone,
    pof_document_path text,
    pof_document_name text,
    pof_document_uploaded_at timestamp with time zone,
    pof_verified_amount numeric,
    pof_expiry_date date,
    pipeline_stage text DEFAULT 'new'::text NOT NULL,
    stage_entered_at timestamp with time zone,
    heat_score integer DEFAULT 0 NOT NULL,
    buyer_lead_id uuid,
    competitive_consent boolean DEFAULT false NOT NULL,
    CONSTRAINT buyer_lists_buyer_type_check CHECK ((buyer_type = ANY (ARRAY['individual'::text, 'company'::text, 'fund'::text, 'strategic'::text]))),
    CONSTRAINT buyer_lists_pipeline_stage_check CHECK ((pipeline_stage = ANY (ARRAY['new'::text, 'contacted'::text, 'nda_sent'::text, 'nda_signed'::text, 'qualified'::text, 'data_room'::text, 'loi'::text, 'negotiation'::text, 'closed'::text, 'lost'::text])))
);


--
-- Name: buyer_match_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_match_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    buyer_profile_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    match_score integer DEFAULT 0 NOT NULL,
    matched_on jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notified_at timestamp with time zone,
    notification_channel text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT buyer_match_events_match_score_check CHECK (((match_score >= 0) AND (match_score <= 100)))
);


--
-- Name: buyer_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    tier text DEFAULT 'match_pass'::text NOT NULL,
    status text DEFAULT 'trialing'::text NOT NULL,
    stripe_customer text,
    stripe_sub text,
    current_period_end timestamp with time zone,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT buyer_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'expired'::text]))),
    CONSTRAINT buyer_subscriptions_tier_check CHECK ((tier = ANY (ARRAY['match_pass'::text, 'match_pass_elite'::text])))
);


--
-- Name: buyer_match_pass; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.buyer_match_pass AS
 SELECT profile_id,
    tier,
    status,
    current_period_end,
    (status = ANY (ARRAY['active'::text, 'trialing'::text])) AS is_active
   FROM public.buyer_subscriptions bs;


--
-- Name: buyer_nqa_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_nqa_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    buyer_list_id uuid,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buyer_pipeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_pipeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    buyer_list_id uuid,
    from_stage text,
    to_stage text NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buyer_search_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_search_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    profile_id uuid,
    email text NOT NULL,
    name text,
    industries text[] DEFAULT '{}'::text[] NOT NULL,
    locations text[] DEFAULT '{}'::text[] NOT NULL,
    min_price numeric,
    max_price numeric,
    min_revenue numeric,
    min_sde numeric,
    available_cash numeric,
    financing_methods text[] DEFAULT '{}'::text[] NOT NULL,
    owner_involvement text,
    timeline text,
    proof_of_funds_status text DEFAULT 'not_requested'::text NOT NULL,
    nda_status text DEFAULT 'not_requested'::text NOT NULL,
    notification_email boolean DEFAULT true NOT NULL,
    notification_sms boolean DEFAULT false NOT NULL,
    notification_frequency text DEFAULT 'instant'::text NOT NULL,
    ai_match_enabled boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    consent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pre_qualified boolean DEFAULT false,
    pre_qualification_note text,
    funds_range text,
    pre_qualified_at timestamp with time zone
);


--
-- Name: buyer_watchlist_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_watchlist_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    buyer_profile_id uuid NOT NULL,
    name text DEFAULT 'Saved search'::text NOT NULL,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    notify_email boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_match_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    provider text NOT NULL,
    external_account_id text,
    display_name text,
    secret_reference text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_synced_at timestamp with time zone,
    sync_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_connections_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'microsoft'::text, 'calcom'::text, 'other'::text]))),
    CONSTRAINT calendar_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'error'::text, 'revoked'::text])))
);


--
-- Name: COLUMN calendar_connections.secret_reference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.calendar_connections.secret_reference IS 'Reference to a token held in a secrets vault; never store OAuth tokens in this table.';


--
-- Name: call_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    assigned_to uuid,
    appointment_id uuid,
    listing_id uuid,
    deal_id uuid,
    seller_lead_id uuid,
    provider text DEFAULT 'twilio'::text NOT NULL,
    provider_call_id text,
    direction text DEFAULT 'inbound'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    caller_number text,
    destination_number text,
    caller_name text,
    purpose text,
    consent_disclosed_at timestamp with time zone,
    recording_url text,
    summary text,
    sentiment text,
    qualification_score numeric(5,2),
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    transferred_to text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_sessions_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT call_sessions_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'ringing'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'transferred'::text, 'voicemail'::text])))
);


--
-- Name: call_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    call_id uuid,
    transcript_excerpt text,
    summary text NOT NULL,
    action_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    sentiment text,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    call_session_id uuid NOT NULL,
    sequence integer NOT NULL,
    speaker text NOT NULL,
    content text NOT NULL,
    confidence numeric(5,4),
    started_at_ms integer,
    ended_at_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_transcripts_speaker_check CHECK ((speaker = ANY (ARRAY['caller'::text, 'assistant'::text, 'broker'::text, 'system'::text])))
);


--
-- Name: training_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    module_id uuid,
    certificate_url text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_code text,
    verified_at timestamp with time zone,
    template text DEFAULT 'gold'::text NOT NULL,
    certificate_key text
);


--
-- Name: certified_brokers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.certified_brokers AS
 SELECT p.id AS broker_id,
    p.full_name,
    p.email,
    p.avatar_url,
    count(DISTINCT tc.module_id) AS modules_certified,
    max(tc.issued_at) AS last_certified_at
   FROM (public.profiles p
     JOIN public.training_certificates tc ON ((tc.broker_id = p.id)))
  GROUP BY p.id, p.full_name, p.email, p.avatar_url;


--
-- Name: cim_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cim_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    version_number integer DEFAULT 1 NOT NULL,
    content jsonb,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    version integer DEFAULT 1 NOT NULL,
    title text,
    content_json jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cim_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'final'::text])))
);


--
-- Name: client_portal_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    client_name text NOT NULL,
    client_email text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    party_type text DEFAULT 'seller'::text NOT NULL,
    CONSTRAINT client_portal_access_party_type_check CHECK ((party_type = ANY (ARRAY['seller'::text, 'buyer'::text]))),
    CONSTRAINT client_portal_access_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: commission_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    deal_id uuid,
    agent_profile_id uuid,
    amount numeric(14,2),
    commission_pct numeric(5,2),
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_records_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text])))
);


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    profile_id uuid,
    listing_id uuid,
    buyer_lead_id uuid,
    seller_lead_id uuid,
    deal_id uuid,
    channel text DEFAULT 'call'::text NOT NULL,
    direction text DEFAULT 'outbound'::text NOT NULL,
    outcome text DEFAULT 'other'::text NOT NULL,
    contact_name text,
    summary text,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_jurisdictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code text DEFAULT 'US'::text NOT NULL,
    state_code text,
    rule text DEFAULT 're_license_when_real_estate'::text NOT NULL,
    note text,
    source text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_policy_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_policy_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jurisdiction text NOT NULL,
    transaction_type text DEFAULT 'business_sale'::text NOT NULL,
    version text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_references jsonb DEFAULT '[]'::jsonb NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    effective_on date,
    expires_on date
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    company text,
    role_in_deal text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contractor_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contractor_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid NOT NULL,
    agency_id uuid,
    amount numeric(14,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    method text DEFAULT 'other'::text NOT NULL,
    reference text,
    category text DEFAULT 'commission'::text NOT NULL,
    commission_record_id uuid,
    deal_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contractor_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT contractor_payments_category_check CHECK ((category = ANY (ARRAY['commission'::text, 'bonus'::text, 'referral'::text, 'retainer'::text, 'other'::text]))),
    CONSTRAINT contractor_payments_method_check CHECK ((method = ANY (ARRAY['ach'::text, 'check'::text, 'cash'::text, 'stripe'::text, 'paypal'::text, 'other'::text])))
);


--
-- Name: contractors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    profile_id uuid,
    legal_name text NOT NULL,
    dba_name text,
    entity_type text DEFAULT 'individual'::text NOT NULL,
    tin_type text DEFAULT 'ssn'::text NOT NULL,
    tin text,
    address text,
    city text,
    state text,
    zip text,
    w9_status text DEFAULT 'missing'::text NOT NULL,
    w9_file_path text,
    start_date date,
    active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contractors_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual'::text, 'single_member_llc'::text, 'multi_member_llc'::text, 'partnership'::text, 'corporation'::text, 's_corp'::text, 'other'::text]))),
    CONSTRAINT contractors_tin_type_check CHECK ((tin_type = ANY (ARRAY['ein'::text, 'ssn'::text]))),
    CONSTRAINT contractors_w9_status_check CHECK ((w9_status = ANY (ARRAY['collected'::text, 'pending'::text, 'missing'::text])))
);


--
-- Name: data_room_access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    data_room_id uuid,
    listing_id uuid NOT NULL,
    requester_name text NOT NULL,
    requester_email text NOT NULL,
    requester_company text,
    rationale text,
    nda_signature text NOT NULL,
    nda_signed_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_room_id uuid NOT NULL,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_ai_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_ai_queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    data_room_id uuid NOT NULL,
    buyer_id uuid,
    asked_by uuid,
    question text NOT NULL,
    answer text,
    allowed_file_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    cited_file_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    redactions_applied jsonb DEFAULT '[]'::jsonb NOT NULL,
    blocked_reason text,
    model_provider text,
    model_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_room_id uuid NOT NULL,
    buyer_email text NOT NULL,
    buyer_name text,
    role text DEFAULT 'viewer'::text NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    last_accessed timestamp with time zone,
    status text DEFAULT 'invited'::text NOT NULL
);


--
-- Name: data_room_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_download_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_download_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    downloader_email text,
    downloaded_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text
);


--
-- Name: data_room_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_room_id uuid NOT NULL,
    folder_id uuid,
    file_name text NOT NULL,
    file_url text NOT NULL,
    storage_path text,
    file_type text,
    file_size bigint,
    file_kind text DEFAULT 'other'::text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    viewed_count integer DEFAULT 0 NOT NULL,
    downloaded_count integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_room_id uuid NOT NULL,
    parent_folder_id uuid,
    name text NOT NULL,
    icon text,
    "order" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_qa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_qa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    data_room_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    CONSTRAINT data_room_qa_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text])))
);


--
-- Name: data_room_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_room_id uuid NOT NULL,
    shared_by uuid,
    share_type text DEFAULT 'email'::text NOT NULL,
    shared_with text,
    role text DEFAULT 'viewer'::text NOT NULL,
    permissions jsonb,
    message text,
    expires_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_trash; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_trash (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_table text NOT NULL,
    original_id uuid NOT NULL,
    file_name text,
    file_url text,
    storage_path text,
    file_kind text,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    restored_at timestamp with time zone,
    restored_by uuid
);


--
-- Name: data_room_view_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_view_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    viewer_email text,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text
);


--
-- Name: data_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    listing_id uuid,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agency_id uuid NOT NULL
);


--
-- Name: deal_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    buyer_id uuid,
    loi_signed_at timestamp with time zone,
    loi_file_url text,
    purchase_agreement_signed_at timestamp with time zone,
    purchase_agreement_file_url text,
    status text DEFAULT 'loi'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_agreements_status_check CHECK ((status = ANY (ARRAY['loi'::text, 'under_contract'::text, 'closing'::text])))
);


--
-- Name: deal_closing_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_closing_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    listing_id uuid,
    closing_date date,
    final_purchase_price numeric,
    final_terms text,
    closing_costs numeric DEFAULT 0,
    net_proceeds numeric DEFAULT 0,
    closed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_closing_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_closing_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    deal_id uuid,
    title text NOT NULL,
    category text DEFAULT 'milestone'::text NOT NULL,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    listing_id uuid,
    agent_id uuid,
    commission_amount numeric DEFAULT 0,
    commission_percentage numeric DEFAULT 0,
    split_with jsonb DEFAULT '[]'::jsonb,
    paid_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_commissions_paid_status_check CHECK ((paid_status = ANY (ARRAY['pending'::text, 'paid'::text])))
);


--
-- Name: deal_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_contacts (
    deal_id uuid NOT NULL,
    contact_id uuid NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_lead_id uuid,
    status text DEFAULT 'prospecting'::text NOT NULL,
    loi_signed_at timestamp with time zone,
    expected_close_date date,
    purchase_price numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    fts_document tsvector,
    agency_id uuid NOT NULL,
    CONSTRAINT deals_status_check CHECK ((status = ANY (ARRAY['prospecting'::text, 'letter_of_intent'::text, 'under_contract'::text, 'due_diligence'::text, 'closing'::text, 'closed'::text])))
);


--
-- Name: due_diligence_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.due_diligence_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date date,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    category text DEFAULT 'General'::text,
    assignee text,
    notes text,
    CONSTRAINT due_diligence_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'waived'::text])))
);


--
-- Name: deal_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.deal_dashboard WITH (security_invoker='true') AS
 SELECT d.id AS deal_id,
    l.business_name,
    l.headline,
    bl.full_name AS buyer_name,
    bl.email AS buyer_email,
    d.status AS deal_status,
    d.purchase_price,
    d.expected_close_date,
    p.full_name AS agent_name,
    ( SELECT count(*) AS count
           FROM public.due_diligence_items ddi
          WHERE ((ddi.deal_id = d.id) AND (ddi.status = 'pending'::text))) AS pending_dd_items,
    ( SELECT count(*) AS count
           FROM public.due_diligence_items ddi
          WHERE ((ddi.deal_id = d.id) AND (ddi.status = ANY (ARRAY['approved'::text, 'waived'::text])))) AS completed_dd_items
   FROM (((public.deals d
     JOIN public.listings l ON ((d.listing_id = l.id)))
     JOIN public.buyer_leads bl ON ((d.buyer_lead_id = bl.id)))
     JOIN public.profiles p ON ((l.agent_id = p.id)));


--
-- Name: deal_digests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_email text NOT NULL,
    listing_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL
);


--
-- Name: deal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    access_level text DEFAULT 'all_parties'::text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_path text,
    category text,
    visible_to_seller boolean DEFAULT true NOT NULL,
    visible_to_buyer boolean DEFAULT false NOT NULL,
    uploaded_by_role text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT deal_documents_access_level_check CHECK ((access_level = ANY (ARRAY['agent_only'::text, 'buyer_only'::text, 'seller_only'::text, 'all_parties'::text])))
);


--
-- Name: deal_escrow_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_escrow_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    deal_id uuid,
    escrow_company text,
    account_ref text,
    amount numeric(14,2),
    status text DEFAULT 'pending'::text NOT NULL,
    funded_at timestamp with time zone,
    released_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_fact_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_fact_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    passport_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    fact_key text NOT NULL,
    fact_label text NOT NULL,
    fact_value jsonb,
    verification_level text DEFAULT 'seller_stated'::text NOT NULL,
    source_type text,
    source_id uuid,
    source_reference text,
    confidence numeric DEFAULT 0 NOT NULL,
    public_disclosure_allowed boolean DEFAULT false NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_fact_evidence_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: deal_notify_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_notify_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    email text NOT NULL,
    name text,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    deal_id uuid,
    buyer_lead_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    purchase_price numeric,
    cash_at_closing numeric,
    seller_note numeric,
    earnout_amount numeric,
    working_capital_adjustment numeric,
    financing_contingency boolean DEFAULT false NOT NULL,
    diligence_days integer,
    training_days integer,
    closing_probability integer DEFAULT 0 NOT NULL,
    seller_value_score integer DEFAULT 0 NOT NULL,
    terms jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_analysis jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_offers_closing_probability_check CHECK (((closing_probability >= 0) AND (closing_probability <= 100))),
    CONSTRAINT deal_offers_seller_value_score_check CHECK (((seller_value_score >= 0) AND (seller_value_score <= 100)))
);


--
-- Name: deal_passports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_passports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    verification_score integer DEFAULT 0 NOT NULL,
    liquidity_score integer DEFAULT 0 NOT NULL,
    financing_score integer DEFAULT 0 NOT NULL,
    documentation_score integer DEFAULT 0 NOT NULL,
    risk_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    readiness_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    last_analyzed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_passports_documentation_score_check CHECK (((documentation_score >= 0) AND (documentation_score <= 100))),
    CONSTRAINT deal_passports_financing_score_check CHECK (((financing_score >= 0) AND (financing_score <= 100))),
    CONSTRAINT deal_passports_liquidity_score_check CHECK (((liquidity_score >= 0) AND (liquidity_score <= 100))),
    CONSTRAINT deal_passports_verification_score_check CHECK (((verification_score >= 0) AND (verification_score <= 100)))
);


--
-- Name: deal_professionals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_professionals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    professional_type text NOT NULL,
    name text NOT NULL,
    firm text,
    title text,
    specialty text,
    industries text[] DEFAULT '{}'::text[] NOT NULL,
    states_served text[] DEFAULT '{}'::text[] NOT NULL,
    country_code text DEFAULT 'US'::text NOT NULL,
    license_number text,
    license_state text,
    license_verified boolean DEFAULT false NOT NULL,
    years_experience integer,
    deals_closed integer,
    bio text,
    rates text,
    website text,
    email text,
    phone text,
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    is_platform_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    loan_size_min numeric,
    loan_size_max numeric,
    loan_programs text[] DEFAULT '{}'::text[],
    turnaround_days integer,
    pays_referral_fees boolean DEFAULT false NOT NULL,
    referral_fee_pct numeric(5,2),
    referral_fee_terms text,
    advertised boolean DEFAULT false NOT NULL,
    fee_agreement_at timestamp with time zone,
    CONSTRAINT deal_professionals_professional_type_check CHECK ((professional_type = ANY (ARRAY['lawyer'::text, 'accountant'::text, 'qoe_agent'::text, 'lender'::text, 'consultant'::text])))
);


--
-- Name: deal_success_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_success_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    deal_id uuid,
    sale_price numeric(14,2) NOT NULL,
    fee_percent numeric(6,4) NOT NULL,
    fee_cents bigint NOT NULL,
    status text DEFAULT 'recorded'::text NOT NULL,
    stripe_invoice text,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_success_fees_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'invoiced'::text, 'paid'::text, 'waived'::text])))
);


--
-- Name: deal_twin_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_twin_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    deal_id uuid,
    health_score integer DEFAULT 0 NOT NULL,
    risk_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_twins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_twins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    deal_id uuid,
    health_score numeric(5,2),
    closing_probability numeric(5,2),
    stage text,
    summary text,
    blockers jsonb DEFAULT '[]'::jsonb NOT NULL,
    risks jsonb DEFAULT '[]'::jsonb NOT NULL,
    next_best_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    missing_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    buyer_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    seller_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    financial_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_analyzed_at timestamp with time zone,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_twins_check CHECK (((listing_id IS NOT NULL) OR (deal_id IS NOT NULL)))
);


--
-- Name: document_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    actor_id uuid,
    action text NOT NULL,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    party_key text NOT NULL,
    party_name text,
    party_email text,
    role text,
    status text DEFAULT 'unsigned'::text NOT NULL,
    signature_data jsonb,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'other'::text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    parties jsonb DEFAULT '[]'::jsonb NOT NULL,
    body_template text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    listing_id uuid,
    deal_id uuid,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    filled_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    parties jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    esign_provider text,
    esign_request_id text,
    esign_status text,
    esign_sent_at timestamp with time zone,
    esign_completed_at timestamp with time zone
);


--
-- Name: COLUMN documents.esign_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents.esign_provider IS 'eSign provider (docusign|hellosign) — null when in-app signature pad used';


--
-- Name: COLUMN documents.esign_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents.esign_status IS 'sent | signed | declined | expired';


--
-- Name: email_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_to text NOT NULL,
    subject text NOT NULL,
    html text,
    text text,
    kind text DEFAULT 'generic'::text,
    meta jsonb,
    status text DEFAULT 'queued'::text,
    error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_emails_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin_agency_id uuid NOT NULL,
    listing_id uuid,
    buyer_lead_id uuid,
    opportunity_type text NOT NULL,
    anonymous_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    permitted_partner_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    disclosure_stage text DEFAULT 'anonymous'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_partnerships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_partnerships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    partner_agency_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    share_buyers boolean DEFAULT false NOT NULL,
    share_listings boolean DEFAULT false NOT NULL,
    default_referral_fee numeric,
    default_commission_split numeric,
    agreement_reference text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    category text DEFAULT 'other'::text NOT NULL,
    vendor text NOT NULL,
    description text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    recurring boolean DEFAULT false NOT NULL,
    paid boolean DEFAULT false NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method text,
    payment_reference text,
    receipt_url text,
    CONSTRAINT expenses_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['ai_api'::text, 'hosting'::text, 'domain'::text, 'sms_phone'::text, 'email'::text, 'tools'::text, 'marketing'::text, 'subscriptions'::text, 'other'::text])))
);


--
-- Name: featured_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.featured_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    days integer DEFAULT 30 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    stripe_session text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT featured_slots_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'refunded'::text])))
);


--
-- Name: financial_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    listing_id uuid,
    file_name text NOT NULL,
    file_url text NOT NULL,
    storage_path text,
    file_size bigint,
    mime_type text,
    file_kind text DEFAULT 'other'::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deal_name text,
    listing_name text,
    recast_data jsonb DEFAULT '{}'::jsonb,
    bov_data jsonb DEFAULT '{}'::jsonb,
    cim_data jsonb DEFAULT '{}'::jsonb,
    bli_data jsonb DEFAULT '{}'::jsonb,
    recast_generated_at timestamp with time zone,
    bov_generated_at timestamp with time zone,
    cim_generated_at timestamp with time zone,
    bli_generated_at timestamp with time zone,
    recast_url text,
    bov_url text,
    cim_url text,
    bli_url text,
    is_auto_generated boolean DEFAULT false,
    extracted_data jsonb DEFAULT '{}'::jsonb,
    financial_summary jsonb DEFAULT '{}'::jsonb,
    document_type text,
    confidence_score numeric,
    processing_status text DEFAULT 'pending'::text,
    processing_started_at timestamp with time zone,
    processing_completed_at timestamp with time zone,
    visible_to_seller boolean DEFAULT true NOT NULL,
    visible_to_buyer boolean DEFAULT false NOT NULL,
    fiscal_year integer,
    operating_years integer,
    doc_type text,
    upload_source text DEFAULT 'broker'::text NOT NULL
);


--
-- Name: financial_extraction_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_extraction_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financial_document_id uuid,
    document_type text,
    extraction_status text DEFAULT 'pending'::text NOT NULL,
    extracted_fields jsonb DEFAULT '{}'::jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financial_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    listing_id uuid,
    fiscal_year integer,
    doc_type text DEFAULT 'other'::text NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    extracted jsonb DEFAULT '{}'::jsonb NOT NULL,
    model text,
    review_state text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    broker_override jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financial_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    year integer,
    label text,
    gross_revenue numeric,
    net_income numeric,
    owner_comp numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financial_inputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_inputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    source_label text,
    raw_text text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financial_interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    qa jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: financial_summary_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.financial_summary_view WITH (security_invoker='true') AS
 SELECT fd.id,
    fd.file_name,
    fd.document_type,
    fd.category,
    fd.status,
    fd.uploaded_at,
    fd.extracted_data,
    fd.financial_summary,
        CASE
            WHEN (fd.document_type = 'tax_return'::text) THEN 'Tax Return'::text
            WHEN (fd.document_type = 'profit_loss'::text) THEN 'P&L Statement'::text
            WHEN (fd.document_type = 'balance_sheet'::text) THEN 'Balance Sheet'::text
            WHEN (fd.document_type = 'bank_statement'::text) THEN 'Bank Statement'::text
            WHEN (fd.document_type = 'sales_report'::text) THEN 'Sales Report'::text
            WHEN (fd.document_type = 'accounts_payable'::text) THEN 'Accounts Payable'::text
            WHEN (fd.document_type = 'accounts_receivable'::text) THEN 'Accounts Receivable'::text
            WHEN (fd.document_type = 'payroll_report'::text) THEN 'Payroll Report'::text
            WHEN (fd.document_type = 'inventory_report'::text) THEN 'Inventory Report'::text
            WHEN (fd.document_type = 'cash_flow'::text) THEN 'Cash Flow'::text
            WHEN (fd.document_type = 'financial_projection'::text) THEN 'Financial Projection'::text
            WHEN (fd.document_type = 'business_plan'::text) THEN 'Business Plan'::text
            WHEN (fd.document_type = 'executive_summary'::text) THEN 'Executive Summary'::text
            WHEN (fd.document_type = 'budget_report'::text) THEN 'Budget Report'::text
            ELSE 'Other Financial Document'::text
        END AS document_type_label,
    p.full_name AS uploaded_by_name,
    COALESCE(l.business_name, d.title) AS related_entity
   FROM (((public.financial_documents fd
     LEFT JOIN public.profiles p ON ((p.id = fd.uploaded_by)))
     LEFT JOIN public.listings l ON ((l.id = fd.listing_id)))
     LEFT JOIN public.deals d ON ((d.id = fd.deal_id)))
  WHERE (fd.processing_status = 'completed'::text);


--
-- Name: generated_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    doc_type text NOT NULL,
    content text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT generated_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['recast_pl'::text, 'balance_sheet'::text, 'bov'::text, 'cim'::text])))
);


--
-- Name: hiring_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hiring_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'advisor'::text NOT NULL,
    description text,
    commission_split numeric DEFAULT 50 NOT NULL,
    base_compensation numeric,
    training_required boolean DEFAULT true NOT NULL,
    certification_required boolean DEFAULT true NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    contact_id uuid,
    direction text NOT NULL,
    communication_type text NOT NULL,
    subject text,
    content text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT interactions_communication_type_check CHECK ((communication_type = ANY (ARRAY['email'::text, 'call'::text, 'note'::text, 'meeting'::text]))),
    CONSTRAINT interactions_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: invite_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    agency_id uuid,
    email text,
    created_by uuid,
    status text DEFAULT 'sent'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filled_at timestamp with time zone
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid,
    profile_id uuid,
    amount numeric NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_invoice text,
    status text DEFAULT 'open'::text NOT NULL,
    pdf_url text,
    due_date timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    type text DEFAULT 'note'::text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: legal_vault; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_vault (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'Legal'::text NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL,
    body_md text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lender_qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lender_qualifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    lender_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    requested_by uuid,
    status text DEFAULT 'requested'::text NOT NULL,
    token text NOT NULL,
    max_loan_amount numeric,
    terms text,
    notes text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    viewed_at timestamp with time zone,
    responded_at timestamp with time zone,
    CONSTRAINT lender_qualifications_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'sent'::text, 'viewed'::text, 'prequalified'::text, 'declined'::text])))
);


--
-- Name: letters_of_intent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.letters_of_intent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    offer_id uuid,
    listing_id uuid NOT NULL,
    buyer_lead_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_call_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_call_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    agency_id uuid,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_compliance_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_compliance_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    check_key text NOT NULL,
    label text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    satisfied boolean DEFAULT false NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    category text NOT NULL,
    party_type text NOT NULL,
    party_name text,
    party_email text,
    party_phone text,
    body_text text,
    file_url text,
    signature_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    signed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    document_type text DEFAULT 'other'::text NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT listing_documents_category_check CHECK ((category = ANY (ARRAY['nda'::text, 'listing_agreement'::text, 'purchase_agreement'::text, 'marketing_agreement'::text, 'financial_proof'::text, 'financial_statement'::text, 'tax_return'::text, 'bank_statement'::text, 'generated_document'::text, 'closing_statement'::text, 'due_diligence'::text, 'other'::text]))),
    CONSTRAINT listing_documents_party_type_check CHECK ((party_type = ANY (ARRAY['seller'::text, 'buyer'::text, 'agent'::text]))),
    CONSTRAINT listing_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'active'::text, 'draft'::text])))
);


--
-- Name: listing_expirations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_expirations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    renewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT listing_expirations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'renewed'::text, 'expired'::text])))
);


--
-- Name: listing_financials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    revenue jsonb DEFAULT '{}'::jsonb,
    sde jsonb DEFAULT '{}'::jsonb,
    ebitda jsonb DEFAULT '{}'::jsonb,
    inventory_value numeric,
    ffe_value numeric,
    real_estate_value numeric,
    total_assets numeric,
    total_liabilities numeric,
    net_worth numeric,
    tax_returns jsonb DEFAULT '[]'::jsonb,
    pnl_statements jsonb DEFAULT '[]'::jsonb,
    balance_sheets jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_intakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_intakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    created_by uuid,
    assigned_to uuid,
    call_session_id uuid,
    appointment_id uuid,
    seller_lead_id uuid,
    converted_listing_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    business_name text,
    industry text,
    location text,
    years_in_business integer,
    annual_revenue numeric,
    sde numeric,
    ebitda numeric,
    asking_price numeric,
    employee_count integer,
    real_estate_included boolean,
    reason_for_selling text,
    desired_timeline text,
    owner_involvement text,
    seller_name text,
    seller_email text,
    seller_phone text,
    preferred_contact text,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    missing_fields text[] DEFAULT '{}'::text[] NOT NULL,
    ai_summary text,
    qualification_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT listing_intakes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'qualifying'::text, 'qualified'::text, 'needs_review'::text, 'converted'::text, 'closed'::text])))
);


--
-- Name: listing_nda_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_nda_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_name text NOT NULL,
    buyer_email text NOT NULL,
    unlock_token text NOT NULL,
    ip_address text,
    user_agent text,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nda_form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    buyer_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    guide_acknowledged boolean DEFAULT false NOT NULL,
    pdf_url text
);


--
-- Name: COLUMN listing_nda_signatures.nda_form_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listing_nda_signatures.nda_form_data IS 'Remaining Confidentiality & Registration Agreement fields (address, phone, EIN/DL, etc). Business Listing ID and Business Category are derived from listings at render/PDF time, never stored here.';


--
-- Name: COLUMN listing_nda_signatures.buyer_profile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listing_nda_signatures.buyer_profile IS 'Full Buyer Profile Form answers (personal info, preferences, background, financials, assets/liabilities).';


--
-- Name: COLUMN listing_nda_signatures.guide_acknowledged; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listing_nda_signatures.guide_acknowledged IS 'Buyer confirmed they read the Buyer Forms Overview & Confidentiality Guide before signing.';


--
-- Name: listing_recasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_recasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    original_sde numeric,
    recasted_sde numeric,
    original_ebitda numeric,
    recasted_ebitda numeric,
    add_backs jsonb DEFAULT '[]'::jsonb,
    adjustments jsonb DEFAULT '[]'::jsonb,
    recasted_by uuid,
    recasted_at timestamp with time zone DEFAULT now(),
    notes text
);


--
-- Name: listing_ref_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listing_ref_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listing_review_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_review_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    actor_id uuid,
    from_stage text,
    to_stage text NOT NULL,
    notes text,
    checklist jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    agency_id uuid,
    visitor_id uuid NOT NULL,
    referrer text,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    agent_id uuid,
    current_step integer DEFAULT 1 NOT NULL,
    completed_steps jsonb DEFAULT '[]'::jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT listing_workflows_current_step_check CHECK (((current_step >= 1) AND (current_step <= 10)))
);


--
-- Name: listings_with_images; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.listings_with_images WITH (security_invoker='true') AS
 SELECT l.id,
    l.agent_id,
    l.business_name,
    l.headline,
    l.industry,
    l.location_general,
    l.description,
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.ebitda,
    l.inventory_value,
    l.ffe_value,
    l.real_estate_included,
    l.reason_for_sale,
    l.status,
    l.created_at,
    l.updated_at,
    l.image_urls,
    l.primary_image_url,
    l.featured_image_url,
    p.full_name AS agent_name,
    p.email AS agent_email,
    COALESCE(l.primary_image_url, l.image_urls[1], 'https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'::text) AS display_image,
    COALESCE(array_length(l.image_urls, 1), 0) AS image_count
   FROM (public.listings l
     JOIN public.profiles p ON ((l.agent_id = p.id)));


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id bigint NOT NULL,
    name text NOT NULL,
    state_code text NOT NULL,
    state_name text,
    place_type text DEFAULT 'city'::text NOT NULL,
    display text NOT NULL,
    population integer,
    lat double precision,
    lng double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT locations_place_type_check CHECK ((place_type = ANY (ARRAY['city'::text, 'county'::text, 'state'::text, 'zip'::text])))
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.locations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: market_multiples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_multiples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    industry text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    basis text DEFAULT 'SDE'::text NOT NULL,
    min_multiple numeric(5,2) NOT NULL,
    max_multiple numeric(5,2) NOT NULL,
    source_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT market_multiples_basis_check CHECK ((basis = ANY (ARRAY['SDE'::text, 'EBITDA'::text])))
);


--
-- Name: marketing_ai_designs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_ai_designs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    prompt text,
    design_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    preview_url text,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_designs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_designs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    product_id uuid,
    design_name text,
    design_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    front_image_url text,
    back_image_url text,
    preview_url text,
    is_ai_generated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    design_id uuid,
    product_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    variant_selections jsonb DEFAULT '{}'::jsonb NOT NULL,
    shipping_address jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    order_total numeric(10,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    tracking_number text,
    stripe_session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    name text NOT NULL,
    variant_type text DEFAULT 'size'::text NOT NULL,
    price_adjustment numeric(10,2) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: marketing_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    base_price numeric(10,2) DEFAULT 0 NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    preview_image text,
    design_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_premium boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    provider text NOT NULL,
    account_label text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    credential_reference text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nda_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nda_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    buyer_id uuid,
    nda_sent_at timestamp with time zone DEFAULT now(),
    nda_signed_at timestamp with time zone,
    nda_expires_at timestamp with time zone,
    nda_file_url text,
    status text DEFAULT 'sent'::text NOT NULL,
    CONSTRAINT nda_requests_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'signed'::text, 'expired'::text, 'rejected'::text])))
);


--
-- Name: negotiation_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negotiation_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    listing_id uuid,
    draft_type text DEFAULT 'counter'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    html text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT negotiation_drafts_draft_type_check CHECK ((draft_type = ANY (ARRAY['counter'::text, 'response'::text, 'playbook'::text])))
);


--
-- Name: newspaper_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newspaper_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    edition_id uuid,
    section text DEFAULT 'Market News'::text NOT NULL,
    headline text,
    body text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: newspaper_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newspaper_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    edition_id uuid,
    email text,
    status text DEFAULT 'sent'::text,
    opened_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT newspaper_delivery_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'queued'::text, 'failed'::text, 'bounced'::text, 'opened'::text])))
);


--
-- Name: newspaper_editions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newspaper_editions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT 'Concord Weekly'::text NOT NULL,
    issue_label text,
    edition_date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    summary text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT newspaper_editions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: newspaper_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newspaper_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    status text DEFAULT 'active'::text NOT NULL,
    token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT newspaper_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'unsubscribed'::text, 'bounced'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    link text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nurture_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nurture_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    email text NOT NULL,
    lead_type text DEFAULT 'buyer'::text,
    current_step integer DEFAULT 0 NOT NULL,
    next_send_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nurture_recipients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text])))
);


--
-- Name: nurture_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nurture_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    name text NOT NULL,
    audience text DEFAULT 'buyer'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nurture_sequences_audience_check CHECK ((audience = ANY (ARRAY['buyer'::text, 'seller'::text])))
);


--
-- Name: onboarding_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    step_key text NOT NULL,
    icon text DEFAULT '📋'::text,
    "order" integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    step_id uuid,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    progress numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_vault; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_vault (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    title text NOT NULL,
    url text,
    username text,
    encrypted_password text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_agent_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_agent_invites (
    email text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phone_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_success_fee_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.platform_success_fee_stats AS
 SELECT count(*) AS deals,
    COALESCE(sum(fee_cents), (0)::numeric) AS total_fee_cents,
    COALESCE(sum(
        CASE
            WHEN (status = 'paid'::text) THEN fee_cents
            ELSE (0)::bigint
        END), (0)::numeric) AS paid_fee_cents
   FROM public.deal_success_fees;


--
-- Name: portal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    author text DEFAULT 'client'::text NOT NULL,
    author_name text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_close_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_close_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    deal_id uuid,
    seller_name text,
    seller_email text,
    buyer_name text,
    buyer_email text,
    closed_at timestamp with time zone,
    checkin_type text DEFAULT 'day90'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    reply text,
    converted_listing_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_close_checkins_checkin_type_check CHECK ((checkin_type = ANY (ARRAY['day90'::text, 'referral_ask'::text, 'testimonial_ask'::text, 'yearly_valuation'::text]))),
    CONSTRAINT post_close_checkins_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'replied'::text, 'converted'::text, 'skipped'::text])))
);


--
-- Name: price_watchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_watchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    email text NOT NULL,
    last_price numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: professional_referral_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_referral_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    professional_id uuid NOT NULL,
    deal_id uuid,
    listing_id uuid,
    basis_amount numeric(14,2),
    fee_pct numeric(5,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    status text DEFAULT 'due'::text NOT NULL,
    invoice_ref text,
    paid_at timestamp with time zone,
    paid_method text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT professional_referral_fees_paid_method_check CHECK ((paid_method = ANY (ARRAY['stripe'::text, 'ach'::text, 'check'::text, 'cash'::text, 'other'::text]))),
    CONSTRAINT professional_referral_fees_status_check CHECK ((status = ANY (ARRAY['due'::text, 'invoiced'::text, 'paid'::text, 'waived'::text])))
);


--
-- Name: profile_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proof_of_funds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proof_of_funds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    requester_email text NOT NULL,
    requester_name text,
    amount numeric(14,2),
    document_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT proof_of_funds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: public_deal_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_deal_stats WITH (security_invoker='true') AS
 SELECT ( SELECT count(*) AS count
           FROM public.listings
          WHERE (listings.status = 'closed'::text)) AS total_businesses_sold;


--
-- Name: public_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    slug text,
    is_featured boolean DEFAULT false NOT NULL,
    gallery_json jsonb DEFAULT '[]'::jsonb,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_confidential boolean DEFAULT false NOT NULL,
    public_title text,
    show_financials boolean DEFAULT false NOT NULL,
    location_exposure text DEFAULT 'general'::text NOT NULL,
    require_buyer_phone boolean DEFAULT false NOT NULL,
    require_buyer_zip boolean DEFAULT false NOT NULL,
    ask_funds_available boolean DEFAULT false NOT NULL,
    ask_buyer_timeframe boolean DEFAULT false NOT NULL,
    public_summary text,
    public_highlights jsonb DEFAULT '[]'::jsonb NOT NULL,
    seller_approved_at timestamp with time zone,
    seller_approval_reference text,
    approved_by uuid,
    approval_expires_at timestamp with time zone,
    revenue_verified boolean DEFAULT false NOT NULL,
    is_off_market boolean DEFAULT false,
    seller_verified boolean DEFAULT false NOT NULL,
    CONSTRAINT public_listings_location_exposure_check CHECK ((location_exposure = ANY (ARRAY['general'::text, 'city_state'::text, 'full_address'::text])))
);


--
-- Name: public_listing_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_listing_feed WITH (security_invoker='true') AS
 SELECT l.id,
        CASE
            WHEN pl.is_confidential THEN COALESCE(pl.public_title, (l.industry || ' Business For Sale'::text))
            ELSE l.business_name
        END AS business_name,
    l.headline,
    l.industry,
    l.business_type,
    l.location_general,
    l.description,
    l.reason_for_sale,
    l.asking_price,
        CASE
            WHEN pl.show_financials THEN l.annual_revenue
            ELSE NULL::numeric
        END AS annual_revenue,
        CASE
            WHEN pl.show_financials THEN l.sde
            ELSE NULL::numeric
        END AS sde,
        CASE
            WHEN pl.show_financials THEN l.ebitda
            ELSE NULL::numeric
        END AS ebitda,
        CASE
            WHEN pl.show_financials THEN l.inventory_value
            ELSE NULL::numeric
        END AS inventory_value,
        CASE
            WHEN pl.show_financials THEN l.ffe_value
            ELSE NULL::numeric
        END AS ffe_value,
    l.real_estate_included,
    l.status,
    l.created_at,
    l.updated_at,
    l.image_urls,
    l.primary_image_url,
    l.featured_image_url,
    pl.slug,
    pl.is_featured,
    pl.is_confidential,
    pl.location_exposure,
        CASE
            WHEN (pl.location_exposure = ANY (ARRAY['city_state'::text, 'full_address'::text])) THEN l.property_city
            ELSE NULL::text
        END AS property_city,
        CASE
            WHEN (pl.location_exposure = ANY (ARRAY['city_state'::text, 'full_address'::text])) THEN l.property_state
            ELSE NULL::text
        END AS property_state,
        CASE
            WHEN (pl.location_exposure = 'full_address'::text) THEN l.property_address
            ELSE NULL::text
        END AS property_address,
        CASE
            WHEN (pl.location_exposure = 'full_address'::text) THEN l.property_zip
            ELSE NULL::text
        END AS property_zip,
    pl.require_buyer_phone,
    pl.require_buyer_zip,
    pl.ask_funds_available,
    pl.ask_buyer_timeframe,
    l.agent_id AS broker_id,
        CASE
            WHEN COALESCE(l.website_confidential, false) THEN NULL::text
            ELSE l.website
        END AS website
   FROM (public.listings l
     JOIN public.public_listings pl ON ((pl.listing_id = l.id)))
  WHERE ((l.status = 'active'::text) AND (l.review_stage = 'approved'::text) AND (pl.published = true));


--
-- Name: purchase_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    file_url text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    signed_by_seller_at timestamp with time zone,
    signed_by_buyer_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_agreements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'under_negotiation'::text, 'sent_for_signature'::text, 'signed'::text])))
);


--
-- Name: recast_add_backs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recast_add_backs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    category text,
    description text,
    amount numeric,
    recurring boolean DEFAULT false NOT NULL,
    year integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recast_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recast_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    business_name text NOT NULL,
    entity_type text DEFAULT 's_corp'::text NOT NULL,
    currency text DEFAULT '$'::text NOT NULL,
    years_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    addbacks_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    result_json jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    referrer_name text NOT NULL,
    referrer_email text NOT NULL,
    referral_type text DEFAULT 'buyer'::text NOT NULL,
    referee_name text,
    referee_email text,
    status text DEFAULT 'new'::text NOT NULL,
    commission_pct numeric(5,2),
    notes text,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrals_referral_type_check CHECK ((referral_type = ANY (ARRAY['buyer'::text, 'seller'::text]))),
    CONSTRAINT referrals_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'paid'::text])))
);


--
-- Name: relationship_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    from_profile_id uuid,
    contact_type text NOT NULL,
    contact_id uuid,
    contact_email_hash text,
    relationship_strength integer DEFAULT 0 NOT NULL,
    last_interaction_at timestamp with time zone,
    interaction_count integer DEFAULT 0 NOT NULL,
    introduction_allowed boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relationship_edges_relationship_strength_check CHECK (((relationship_strength >= 0) AND (relationship_strength <= 100)))
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    profile_id uuid,
    listing_id uuid,
    title text NOT NULL,
    notes text,
    kind text DEFAULT 'call_back'::text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    buyer_lead_id uuid,
    seller_lead_id uuid,
    deal_id uuid
);


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    query text,
    filters jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sba_qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sba_qualifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    is_sba_eligible boolean,
    sba_reason text,
    sba_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    is_optional boolean DEFAULT true NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    source text
);


--
-- Name: search_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    query text,
    scope text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    form_type text NOT NULL,
    form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    share_token text,
    signer_name text,
    signer_title text,
    signed_at timestamp with time zone,
    ip_address text,
    user_agent text,
    pdf_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    additional_signers jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT seller_forms_form_type_check CHECK ((form_type = ANY (ARRAY['seller_interview'::text, 'listing_agreement'::text, 'corp_resolution'::text, 'llc_resolution'::text, 'doc_checklist'::text]))),
    CONSTRAINT seller_forms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text])))
);


--
-- Name: COLUMN seller_forms.additional_signers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.seller_forms.additional_signers IS 'Co-sellers beyond the primary signer_name/signer_title, e.g. [{"name":"Jane Doe","title":"Co-Owner"}]. The first fills the template''s second real signature block (Corp/LLC Resolution, Seller Interview) if it has one; the rest print on an appended Additional Signatures page.';


--
-- Name: seller_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text,
    email text,
    phone text,
    business_name text,
    industry text,
    revenue_range text,
    timeframe text,
    message text,
    status text DEFAULT 'new'::text NOT NULL,
    converted_listing_id uuid,
    claimed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_name text,
    location_general text,
    notes text,
    fts_document tsvector,
    agency_id uuid NOT NULL,
    source text,
    portal_token text,
    CONSTRAINT seller_leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'qualifying'::text, 'qualified'::text, 'handed_off'::text, 'not_a_fit'::text, 'contacted'::text, 'closed'::text])))
);


--
-- Name: seller_listing_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_listing_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    seller_profile_id uuid,
    listing_id uuid,
    plan_code text NOT NULL,
    amount_cents integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider text,
    provider_session_id text,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_readiness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_readiness (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    readiness_score integer DEFAULT 0 NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    action_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    valuation_estimate numeric(14,2),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    platform text NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    reach integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    engagement_rate numeric DEFAULT 0 NOT NULL,
    collected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    platform text NOT NULL,
    access_token text,
    refresh_token text,
    platform_user_id text,
    platform_username text,
    platform_name text,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    agent_id uuid NOT NULL,
    platform text NOT NULL,
    post_id text,
    post_url text,
    content text,
    image_urls text[] DEFAULT '{}'::text[],
    scheduled_for timestamp with time zone,
    posted_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    engagement_likes integer DEFAULT 0 NOT NULL,
    engagement_comments integer DEFAULT 0 NOT NULL,
    engagement_shares integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    platform text NOT NULL,
    auto_post_enabled boolean DEFAULT true NOT NULL,
    post_template text,
    include_images boolean DEFAULT true NOT NULL,
    include_link boolean DEFAULT true NOT NULL,
    hashtags text,
    custom_message text,
    schedule_time time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sold_comps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sold_comps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    business_name text NOT NULL,
    industry text,
    location text,
    sale_price numeric(14,2),
    revenue numeric(14,2),
    sde numeric(14,2),
    multiple numeric(6,2),
    sold_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    plan_type text DEFAULT 'trial'::text NOT NULL,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    agency_id uuid,
    tier text NOT NULL,
    stripe_customer text,
    stripe_sub text,
    status text DEFAULT 'trialing'::text NOT NULL,
    current_period_end timestamp with time zone,
    trial_end timestamp with time zone,
    seats integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: syndication_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syndication_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    from_agency_id uuid NOT NULL,
    to_agency_id uuid NOT NULL,
    to_profile_id uuid,
    split_pct numeric(5,2) DEFAULT 50.00 NOT NULL,
    status text DEFAULT 'offered'::text NOT NULL,
    note text,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT syndication_offers_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])))
);


--
-- Name: team_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid,
    accepted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    CONSTRAINT team_invites_role_check CHECK ((role = ANY (ARRAY['agent'::text, 'broker'::text, 'admin'::text]))),
    CONSTRAINT team_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- Name: training_gamification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_gamification (
    broker_id uuid NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    best_streak integer DEFAULT 0 NOT NULL,
    modules_certified integer DEFAULT 0 NOT NULL,
    program_certified boolean DEFAULT false NOT NULL,
    last_active_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_lesson_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_lesson_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid,
    media_type text DEFAULT 'slides'::text NOT NULL,
    url text NOT NULL,
    title text,
    "order" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid,
    title text NOT NULL,
    content text,
    video_url text,
    pdf_url text,
    "order" integer DEFAULT 0 NOT NULL,
    duration_minutes integer DEFAULT 10 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    icon text DEFAULT '📘'::text,
    "order" integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    lesson_id uuid,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    rating integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_quiz_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid,
    question text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    correct_answer text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broker_id uuid,
    title text NOT NULL,
    file_url text NOT NULL,
    file_type text DEFAULT 'pdf'::text NOT NULL,
    module_id uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transition_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transition_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    owner_id uuid,
    start_date date,
    target_completion_date date,
    completion_percent integer DEFAULT 0 NOT NULL,
    milestones jsonb DEFAULT '[]'::jsonb NOT NULL,
    earnout_tracking jsonb DEFAULT '{}'::jsonb NOT NULL,
    working_capital_checks jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transition_plans_completion_percent_check CHECK (((completion_percent >= 0) AND (completion_percent <= 100)))
);


--
-- Name: trial_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    trial_days integer DEFAULT 14 NOT NULL,
    max_listings integer DEFAULT 5 NOT NULL,
    max_leads integer DEFAULT 20 NOT NULL,
    max_deals integer DEFAULT 5 NOT NULL,
    max_agents integer DEFAULT 3 NOT NULL,
    max_storage_mb bigint DEFAULT 100 NOT NULL,
    send_reminders boolean DEFAULT true NOT NULL,
    grace_days integer DEFAULT 7 NOT NULL,
    archive_days integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trust_center_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_center_settings (
    agency_id uuid NOT NULL,
    confidentiality_statement text,
    security_summary text,
    ai_use_policy text,
    accessibility_statement text,
    complaint_process text,
    copyright_notice text,
    dmca_contact text,
    license_disclosures jsonb DEFAULT '[]'::jsonb NOT NULL,
    incident_contact text,
    published boolean DEFAULT false NOT NULL,
    reviewed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: valuation_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valuation_estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    listing_id uuid,
    seller_lead_id uuid,
    estimate_min numeric(14,2),
    estimate_max numeric(14,2),
    midpoint numeric(14,2),
    method text,
    multiples jsonb DEFAULT '{}'::jsonb NOT NULL,
    inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: valuation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valuation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    agency_id uuid,
    listing_id uuid,
    tier text DEFAULT 'standard'::text NOT NULL,
    amount_cents integer DEFAULT 19900 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    report_url text,
    stripe_session text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT valuation_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'generating'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT valuation_reports_tier_check CHECK ((tier = ANY (ARRAY['standard'::text, 'full_bov'::text])))
);


--
-- Name: value_growth_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.value_growth_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    seller_lead_id uuid,
    listing_id uuid,
    baseline_value numeric,
    target_value numeric,
    target_exit_date date,
    readiness_score integer DEFAULT 0 NOT NULL,
    owner_dependence_score integer DEFAULT 0 NOT NULL,
    concentration_score integer DEFAULT 0 NOT NULL,
    action_plan jsonb DEFAULT '[]'::jsonb NOT NULL,
    milestone_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT value_growth_plans_concentration_score_check CHECK (((concentration_score >= 0) AND (concentration_score <= 100))),
    CONSTRAINT value_growth_plans_owner_dependence_score_check CHECK (((owner_dependence_score >= 0) AND (owner_dependence_score <= 100))),
    CONSTRAINT value_growth_plans_readiness_score_check CHECK (((readiness_score >= 0) AND (readiness_score <= 100)))
);


--
-- Name: verified_financials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verified_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    plaid_item_id text,
    plaid_access_token text,
    institution_name text,
    account_mask text,
    account_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    verified_revenue numeric,
    verified_period text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_detail jsonb,
    verified_revenue_basis text,
    seller_confirmed_at timestamp with time zone,
    CONSTRAINT verified_financials_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'connected'::text, 'verified'::text, 'failed'::text])))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_type text,
    payload_json jsonb,
    processed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: ad_slots ad_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_slots
    ADD CONSTRAINT ad_slots_pkey PRIMARY KEY (id);


--
-- Name: ad_slots ad_slots_slot_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_slots
    ADD CONSTRAINT ad_slots_slot_key_key UNIQUE (slot_key);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: agencies agencies_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_domain_key UNIQUE (domain);


--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);


--
-- Name: agencies agencies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_slug_key UNIQUE (slug);


--
-- Name: agency_ai_providers agency_ai_providers_agency_id_purpose_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_ai_providers
    ADD CONSTRAINT agency_ai_providers_agency_id_purpose_key UNIQUE (agency_id, purpose);


--
-- Name: agency_ai_providers agency_ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_ai_providers
    ADD CONSTRAINT agency_ai_providers_pkey PRIMARY KEY (id);


--
-- Name: agency_members agency_members_agency_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_members
    ADD CONSTRAINT agency_members_agency_id_profile_id_key UNIQUE (agency_id, profile_id);


--
-- Name: agency_members agency_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_members
    ADD CONSTRAINT agency_members_pkey PRIMARY KEY (id);


--
-- Name: agency_onboarding agency_onboarding_agency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_onboarding
    ADD CONSTRAINT agency_onboarding_agency_id_key UNIQUE (agency_id);


--
-- Name: agency_onboarding agency_onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_onboarding
    ADD CONSTRAINT agency_onboarding_pkey PRIMARY KEY (id);


--
-- Name: agency_settings agency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT agency_settings_pkey PRIMARY KEY (agency_id);


--
-- Name: agency_site_themes agency_site_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_site_themes
    ADD CONSTRAINT agency_site_themes_pkey PRIMARY KEY (agency_id);


--
-- Name: agency_usage agency_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_usage
    ADD CONSTRAINT agency_usage_pkey PRIMARY KEY (id);


--
-- Name: agent_agreements agent_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_agreements
    ADD CONSTRAINT agent_agreements_pkey PRIMARY KEY (id);


--
-- Name: agent_applications agent_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_applications
    ADD CONSTRAINT agent_applications_pkey PRIMARY KEY (id);


--
-- Name: agent_contact_requests agent_contact_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_contact_requests
    ADD CONSTRAINT agent_contact_requests_pkey PRIMARY KEY (id);


--
-- Name: agent_performance agent_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance
    ADD CONSTRAINT agent_performance_pkey PRIMARY KEY (id);


--
-- Name: agent_performance_snapshots agent_performance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance_snapshots
    ADD CONSTRAINT agent_performance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_performance_snapshots agent_performance_snapshots_profile_id_period_start_period__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance_snapshots
    ADD CONSTRAINT agent_performance_snapshots_profile_id_period_start_period__key UNIQUE (profile_id, period_start, period_end);


--
-- Name: ai_actions ai_actions_agency_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_agency_id_idempotency_key_key UNIQUE (agency_id, idempotency_key);


--
-- Name: ai_actions ai_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_config ai_agent_config_agency_id_agent_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_config
    ADD CONSTRAINT ai_agent_config_agency_id_agent_key_key UNIQUE (agency_id, agent_key);


--
-- Name: ai_agent_config ai_agent_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_config
    ADD CONSTRAINT ai_agent_config_pkey PRIMARY KEY (id);


--
-- Name: ai_approvals ai_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_approvals
    ADD CONSTRAINT ai_approvals_pkey PRIMARY KEY (id);


--
-- Name: ai_prompt_versions ai_prompt_versions_agency_id_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_versions
    ADD CONSTRAINT ai_prompt_versions_agency_id_name_version_key UNIQUE (agency_id, name, version);


--
-- Name: ai_prompt_versions ai_prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_versions
    ADD CONSTRAINT ai_prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: api_keys_registry api_keys_registry_key_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys_registry
    ADD CONSTRAINT api_keys_registry_key_name_key UNIQUE (key_name);


--
-- Name: api_keys_registry api_keys_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys_registry
    ADD CONSTRAINT api_keys_registry_pkey PRIMARY KEY (id);


--
-- Name: app_notifications app_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: auto_generation_logs auto_generation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_generation_logs
    ADD CONSTRAINT auto_generation_logs_pkey PRIMARY KEY (id);


--
-- Name: bbs_syncs bbs_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_syncs
    ADD CONSTRAINT bbs_syncs_pkey PRIMARY KEY (id);


--
-- Name: bli_versions bli_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bli_versions
    ADD CONSTRAINT bli_versions_pkey PRIMARY KEY (id);


--
-- Name: bov_versions bov_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bov_versions
    ADD CONSTRAINT bov_versions_pkey PRIMARY KEY (id);


--
-- Name: broker_financial_files broker_financial_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_financial_files
    ADD CONSTRAINT broker_financial_files_pkey PRIMARY KEY (id);


--
-- Name: broker_photos broker_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_photos
    ADD CONSTRAINT broker_photos_pkey PRIMARY KEY (id);


--
-- Name: broker_profiles broker_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_profiles
    ADD CONSTRAINT broker_profiles_pkey PRIMARY KEY (id);


--
-- Name: broker_profiles broker_profiles_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_profiles
    ADD CONSTRAINT broker_profiles_profile_id_key UNIQUE (profile_id);


--
-- Name: buyer_bookmarked_listings buyer_bookmarked_listings_buyer_profile_id_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_bookmarked_listings
    ADD CONSTRAINT buyer_bookmarked_listings_buyer_profile_id_listing_id_key UNIQUE (buyer_profile_id, listing_id);


--
-- Name: buyer_bookmarked_listings buyer_bookmarked_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_bookmarked_listings
    ADD CONSTRAINT buyer_bookmarked_listings_pkey PRIMARY KEY (id);


--
-- Name: buyer_engagement_scores buyer_engagement_scores_listing_id_buyer_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_listing_id_buyer_lead_id_key UNIQUE (listing_id, buyer_lead_id);


--
-- Name: buyer_engagement_scores buyer_engagement_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_pkey PRIMARY KEY (id);


--
-- Name: buyer_leads buyer_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_leads
    ADD CONSTRAINT buyer_leads_pkey PRIMARY KEY (id);


--
-- Name: buyer_lists buyer_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_lists
    ADD CONSTRAINT buyer_lists_pkey PRIMARY KEY (id);


--
-- Name: buyer_match_events buyer_match_events_buyer_profile_id_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_match_events
    ADD CONSTRAINT buyer_match_events_buyer_profile_id_listing_id_key UNIQUE (buyer_profile_id, listing_id);


--
-- Name: buyer_match_events buyer_match_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_match_events
    ADD CONSTRAINT buyer_match_events_pkey PRIMARY KEY (id);


--
-- Name: buyer_nqa_responses buyer_nqa_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_nqa_responses
    ADD CONSTRAINT buyer_nqa_responses_pkey PRIMARY KEY (id);


--
-- Name: buyer_pipeline_events buyer_pipeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_pipeline_events
    ADD CONSTRAINT buyer_pipeline_events_pkey PRIMARY KEY (id);


--
-- Name: buyer_search_profiles buyer_search_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_search_profiles
    ADD CONSTRAINT buyer_search_profiles_pkey PRIMARY KEY (id);


--
-- Name: buyer_subscriptions buyer_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_subscriptions
    ADD CONSTRAINT buyer_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: buyer_subscriptions buyer_subscriptions_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_subscriptions
    ADD CONSTRAINT buyer_subscriptions_profile_id_key UNIQUE (profile_id);


--
-- Name: buyer_watchlist_searches buyer_watchlist_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_watchlist_searches
    ADD CONSTRAINT buyer_watchlist_searches_pkey PRIMARY KEY (id);


--
-- Name: calendar_connections calendar_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_pkey PRIMARY KEY (id);


--
-- Name: calendar_connections calendar_connections_profile_id_provider_external_account_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_profile_id_provider_external_account_i_key UNIQUE (profile_id, provider, external_account_id);


--
-- Name: call_sessions call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_pkey PRIMARY KEY (id);


--
-- Name: call_sessions call_sessions_provider_provider_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_provider_provider_call_id_key UNIQUE (provider, provider_call_id);


--
-- Name: call_summaries call_summaries_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_summaries
    ADD CONSTRAINT call_summaries_call_id_key UNIQUE (call_id);


--
-- Name: call_summaries call_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_summaries
    ADD CONSTRAINT call_summaries_pkey PRIMARY KEY (id);


--
-- Name: call_transcripts call_transcripts_call_session_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_call_session_id_sequence_key UNIQUE (call_session_id, sequence);


--
-- Name: call_transcripts call_transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_pkey PRIMARY KEY (id);


--
-- Name: cim_versions cim_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cim_versions
    ADD CONSTRAINT cim_versions_pkey PRIMARY KEY (id);


--
-- Name: client_portal_access client_portal_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access
    ADD CONSTRAINT client_portal_access_pkey PRIMARY KEY (id);


--
-- Name: client_portal_access client_portal_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access
    ADD CONSTRAINT client_portal_access_token_key UNIQUE (token);


--
-- Name: commission_records commission_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_records
    ADD CONSTRAINT commission_records_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: compliance_jurisdictions compliance_jurisdictions_country_code_state_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_jurisdictions
    ADD CONSTRAINT compliance_jurisdictions_country_code_state_code_key UNIQUE (country_code, state_code);


--
-- Name: compliance_jurisdictions compliance_jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_jurisdictions
    ADD CONSTRAINT compliance_jurisdictions_pkey PRIMARY KEY (id);


--
-- Name: compliance_policy_packs compliance_policy_packs_jurisdiction_transaction_type_versi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_policy_packs
    ADD CONSTRAINT compliance_policy_packs_jurisdiction_transaction_type_versi_key UNIQUE (jurisdiction, transaction_type, version);


--
-- Name: compliance_policy_packs compliance_policy_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_policy_packs
    ADD CONSTRAINT compliance_policy_packs_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contractor_payments contractor_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_pkey PRIMARY KEY (id);


--
-- Name: contractors contractors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_pkey PRIMARY KEY (id);


--
-- Name: data_room_access_requests data_room_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_requests
    ADD CONSTRAINT data_room_access_requests_pkey PRIMARY KEY (id);


--
-- Name: data_room_activities data_room_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_activities
    ADD CONSTRAINT data_room_activities_pkey PRIMARY KEY (id);


--
-- Name: data_room_ai_queries data_room_ai_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_ai_queries
    ADD CONSTRAINT data_room_ai_queries_pkey PRIMARY KEY (id);


--
-- Name: data_room_buyers data_room_buyers_data_room_id_buyer_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_buyers
    ADD CONSTRAINT data_room_buyers_data_room_id_buyer_email_key UNIQUE (data_room_id, buyer_email);


--
-- Name: data_room_buyers data_room_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_buyers
    ADD CONSTRAINT data_room_buyers_pkey PRIMARY KEY (id);


--
-- Name: data_room_comments data_room_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_comments
    ADD CONSTRAINT data_room_comments_pkey PRIMARY KEY (id);


--
-- Name: data_room_download_logs data_room_download_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_download_logs
    ADD CONSTRAINT data_room_download_logs_pkey PRIMARY KEY (id);


--
-- Name: data_room_files data_room_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_pkey PRIMARY KEY (id);


--
-- Name: data_room_folders data_room_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_folders
    ADD CONSTRAINT data_room_folders_pkey PRIMARY KEY (id);


--
-- Name: data_room_qa data_room_qa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_qa
    ADD CONSTRAINT data_room_qa_pkey PRIMARY KEY (id);


--
-- Name: data_room_shares data_room_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_shares
    ADD CONSTRAINT data_room_shares_pkey PRIMARY KEY (id);


--
-- Name: data_room_trash data_room_trash_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_trash
    ADD CONSTRAINT data_room_trash_pkey PRIMARY KEY (id);


--
-- Name: data_room_view_logs data_room_view_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_view_logs
    ADD CONSTRAINT data_room_view_logs_pkey PRIMARY KEY (id);


--
-- Name: data_rooms data_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_rooms
    ADD CONSTRAINT data_rooms_pkey PRIMARY KEY (id);


--
-- Name: deal_agreements deal_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_pkey PRIMARY KEY (id);


--
-- Name: deal_closing_details deal_closing_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_details
    ADD CONSTRAINT deal_closing_details_pkey PRIMARY KEY (id);


--
-- Name: deal_closing_milestones deal_closing_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_milestones
    ADD CONSTRAINT deal_closing_milestones_pkey PRIMARY KEY (id);


--
-- Name: deal_commissions deal_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_commissions
    ADD CONSTRAINT deal_commissions_pkey PRIMARY KEY (id);


--
-- Name: deal_contacts deal_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_pkey PRIMARY KEY (deal_id, contact_id);


--
-- Name: deal_digests deal_digests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_digests
    ADD CONSTRAINT deal_digests_pkey PRIMARY KEY (id);


--
-- Name: deal_documents deal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_documents
    ADD CONSTRAINT deal_documents_pkey PRIMARY KEY (id);


--
-- Name: deal_escrow_accounts deal_escrow_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_escrow_accounts
    ADD CONSTRAINT deal_escrow_accounts_pkey PRIMARY KEY (id);


--
-- Name: deal_fact_evidence deal_fact_evidence_listing_id_fact_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_listing_id_fact_key_key UNIQUE (listing_id, fact_key);


--
-- Name: deal_fact_evidence deal_fact_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_pkey PRIMARY KEY (id);


--
-- Name: deal_notify_subscriptions deal_notify_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_notify_subscriptions
    ADD CONSTRAINT deal_notify_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: deal_offers deal_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_offers
    ADD CONSTRAINT deal_offers_pkey PRIMARY KEY (id);


--
-- Name: deal_passports deal_passports_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_passports
    ADD CONSTRAINT deal_passports_listing_id_key UNIQUE (listing_id);


--
-- Name: deal_passports deal_passports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_passports
    ADD CONSTRAINT deal_passports_pkey PRIMARY KEY (id);


--
-- Name: deal_professionals deal_professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_professionals
    ADD CONSTRAINT deal_professionals_pkey PRIMARY KEY (id);


--
-- Name: deal_success_fees deal_success_fees_listing_id_deal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_success_fees
    ADD CONSTRAINT deal_success_fees_listing_id_deal_id_key UNIQUE (listing_id, deal_id);


--
-- Name: deal_success_fees deal_success_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_success_fees
    ADD CONSTRAINT deal_success_fees_pkey PRIMARY KEY (id);


--
-- Name: deal_twin_snapshots deal_twin_snapshots_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twin_snapshots
    ADD CONSTRAINT deal_twin_snapshots_listing_id_key UNIQUE (listing_id);


--
-- Name: deal_twin_snapshots deal_twin_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twin_snapshots
    ADD CONSTRAINT deal_twin_snapshots_pkey PRIMARY KEY (id);


--
-- Name: deal_twins deal_twins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twins
    ADD CONSTRAINT deal_twins_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: document_audit_logs document_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_audit_logs
    ADD CONSTRAINT document_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: document_signatures document_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT document_signatures_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: due_diligence_items due_diligence_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.due_diligence_items
    ADD CONSTRAINT due_diligence_items_pkey PRIMARY KEY (id);


--
-- Name: email_emails email_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_emails
    ADD CONSTRAINT email_emails_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_agency_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_agency_id_name_key UNIQUE (agency_id, name);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: exchange_opportunities exchange_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_opportunities
    ADD CONSTRAINT exchange_opportunities_pkey PRIMARY KEY (id);


--
-- Name: exchange_partnerships exchange_partnerships_agency_id_partner_agency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_partnerships
    ADD CONSTRAINT exchange_partnerships_agency_id_partner_agency_id_key UNIQUE (agency_id, partner_agency_id);


--
-- Name: exchange_partnerships exchange_partnerships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_partnerships
    ADD CONSTRAINT exchange_partnerships_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: featured_slots featured_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_slots
    ADD CONSTRAINT featured_slots_pkey PRIMARY KEY (id);


--
-- Name: financial_documents financial_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_pkey PRIMARY KEY (id);


--
-- Name: financial_documents financial_documents_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_storage_path_key UNIQUE (storage_path);


--
-- Name: financial_extraction_logs financial_extraction_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extraction_logs
    ADD CONSTRAINT financial_extraction_logs_pkey PRIMARY KEY (id);


--
-- Name: financial_extractions financial_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extractions
    ADD CONSTRAINT financial_extractions_pkey PRIMARY KEY (id);


--
-- Name: financial_history financial_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_history
    ADD CONSTRAINT financial_history_pkey PRIMARY KEY (id);


--
-- Name: financial_inputs financial_inputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_inputs
    ADD CONSTRAINT financial_inputs_pkey PRIMARY KEY (id);


--
-- Name: financial_interviews financial_interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_interviews
    ADD CONSTRAINT financial_interviews_pkey PRIMARY KEY (id);


--
-- Name: financial_ledger financial_ledger_listing_id_fiscal_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_ledger
    ADD CONSTRAINT financial_ledger_listing_id_fiscal_year_month_key UNIQUE (listing_id, fiscal_year, month);


--
-- Name: financial_ledger financial_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_ledger
    ADD CONSTRAINT financial_ledger_pkey PRIMARY KEY (id);


--
-- Name: generated_documents generated_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_documents
    ADD CONSTRAINT generated_documents_pkey PRIMARY KEY (id);


--
-- Name: hiring_packages hiring_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiring_packages
    ADD CONSTRAINT hiring_packages_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_token_key UNIQUE (token);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: legal_vault legal_vault_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_vault
    ADD CONSTRAINT legal_vault_pkey PRIMARY KEY (id);


--
-- Name: legal_vault legal_vault_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_vault
    ADD CONSTRAINT legal_vault_slug_key UNIQUE (slug);


--
-- Name: lender_qualifications lender_qualifications_deal_id_lender_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_deal_id_lender_id_key UNIQUE (deal_id, lender_id);


--
-- Name: lender_qualifications lender_qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_pkey PRIMARY KEY (id);


--
-- Name: lender_qualifications lender_qualifications_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_token_key UNIQUE (token);


--
-- Name: letters_of_intent letters_of_intent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters_of_intent
    ADD CONSTRAINT letters_of_intent_pkey PRIMARY KEY (id);


--
-- Name: listing_call_clicks listing_call_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_call_clicks
    ADD CONSTRAINT listing_call_clicks_pkey PRIMARY KEY (id);


--
-- Name: listing_compliance_checks listing_compliance_checks_listing_id_check_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_compliance_checks
    ADD CONSTRAINT listing_compliance_checks_listing_id_check_key_key UNIQUE (listing_id, check_key);


--
-- Name: listing_compliance_checks listing_compliance_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_compliance_checks
    ADD CONSTRAINT listing_compliance_checks_pkey PRIMARY KEY (id);


--
-- Name: listing_documents listing_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_documents
    ADD CONSTRAINT listing_documents_pkey PRIMARY KEY (id);


--
-- Name: listing_expirations listing_expirations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_expirations
    ADD CONSTRAINT listing_expirations_pkey PRIMARY KEY (id);


--
-- Name: listing_financials listing_financials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_financials
    ADD CONSTRAINT listing_financials_pkey PRIMARY KEY (id);


--
-- Name: listing_intakes listing_intakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_pkey PRIMARY KEY (id);


--
-- Name: listing_nda_signatures listing_nda_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_nda_signatures
    ADD CONSTRAINT listing_nda_signatures_pkey PRIMARY KEY (id);


--
-- Name: listing_nda_signatures listing_nda_signatures_unlock_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_nda_signatures
    ADD CONSTRAINT listing_nda_signatures_unlock_token_key UNIQUE (unlock_token);


--
-- Name: listing_recasts listing_recasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_recasts
    ADD CONSTRAINT listing_recasts_pkey PRIMARY KEY (id);


--
-- Name: listing_review_events listing_review_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_review_events
    ADD CONSTRAINT listing_review_events_pkey PRIMARY KEY (id);


--
-- Name: listing_views listing_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_pkey PRIMARY KEY (id);


--
-- Name: listing_workflows listing_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_workflows
    ADD CONSTRAINT listing_workflows_pkey PRIMARY KEY (id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: market_multiples market_multiples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_multiples
    ADD CONSTRAINT market_multiples_pkey PRIMARY KEY (id);


--
-- Name: marketing_ai_designs marketing_ai_designs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_ai_designs
    ADD CONSTRAINT marketing_ai_designs_pkey PRIMARY KEY (id);


--
-- Name: marketing_designs marketing_designs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_designs
    ADD CONSTRAINT marketing_designs_pkey PRIMARY KEY (id);


--
-- Name: marketing_orders marketing_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_orders
    ADD CONSTRAINT marketing_orders_pkey PRIMARY KEY (id);


--
-- Name: marketing_product_variants marketing_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_product_variants
    ADD CONSTRAINT marketing_product_variants_pkey PRIMARY KEY (id);


--
-- Name: marketing_products marketing_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_products
    ADD CONSTRAINT marketing_products_pkey PRIMARY KEY (id);


--
-- Name: marketing_templates marketing_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_templates
    ADD CONSTRAINT marketing_templates_pkey PRIMARY KEY (id);


--
-- Name: marketplace_connections marketplace_connections_agency_id_provider_account_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_connections
    ADD CONSTRAINT marketplace_connections_agency_id_provider_account_label_key UNIQUE (agency_id, provider, account_label);


--
-- Name: marketplace_connections marketplace_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_connections
    ADD CONSTRAINT marketplace_connections_pkey PRIMARY KEY (id);


--
-- Name: nda_requests nda_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nda_requests
    ADD CONSTRAINT nda_requests_pkey PRIMARY KEY (id);


--
-- Name: negotiation_drafts negotiation_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negotiation_drafts
    ADD CONSTRAINT negotiation_drafts_pkey PRIMARY KEY (id);


--
-- Name: newspaper_articles newspaper_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_articles
    ADD CONSTRAINT newspaper_articles_pkey PRIMARY KEY (id);


--
-- Name: newspaper_delivery_log newspaper_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_delivery_log
    ADD CONSTRAINT newspaper_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: newspaper_editions newspaper_editions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_editions
    ADD CONSTRAINT newspaper_editions_pkey PRIMARY KEY (id);


--
-- Name: newspaper_subscriptions newspaper_subscriptions_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_subscriptions
    ADD CONSTRAINT newspaper_subscriptions_email_key UNIQUE (email);


--
-- Name: newspaper_subscriptions newspaper_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_subscriptions
    ADD CONSTRAINT newspaper_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nurture_recipients nurture_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nurture_recipients
    ADD CONSTRAINT nurture_recipients_pkey PRIMARY KEY (id);


--
-- Name: nurture_sequences nurture_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nurture_sequences
    ADD CONSTRAINT nurture_sequences_pkey PRIMARY KEY (id);


--
-- Name: onboarding_steps onboarding_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_steps
    ADD CONSTRAINT onboarding_steps_pkey PRIMARY KEY (id);


--
-- Name: onboarding_steps onboarding_steps_step_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_steps
    ADD CONSTRAINT onboarding_steps_step_key_key UNIQUE (step_key);


--
-- Name: onboarding_tasks onboarding_tasks_broker_id_step_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_broker_id_step_id_key UNIQUE (broker_id, step_id);


--
-- Name: onboarding_tasks onboarding_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id);


--
-- Name: password_vault password_vault_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_vault
    ADD CONSTRAINT password_vault_pkey PRIMARY KEY (id);


--
-- Name: pending_agent_invites pending_agent_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_agent_invites
    ADD CONSTRAINT pending_agent_invites_pkey PRIMARY KEY (email);


--
-- Name: phone_verifications phone_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_verifications
    ADD CONSTRAINT phone_verifications_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (profile_id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: portal_messages portal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_pkey PRIMARY KEY (id);


--
-- Name: post_close_checkins post_close_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_close_checkins
    ADD CONSTRAINT post_close_checkins_pkey PRIMARY KEY (id);


--
-- Name: price_watchers price_watchers_listing_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_watchers
    ADD CONSTRAINT price_watchers_listing_id_email_key UNIQUE (listing_id, email);


--
-- Name: price_watchers price_watchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_watchers
    ADD CONSTRAINT price_watchers_pkey PRIMARY KEY (id);


--
-- Name: professional_referral_fees professional_referral_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_pkey PRIMARY KEY (id);


--
-- Name: professional_referral_fees professional_referral_fees_professional_id_deal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_professional_id_deal_id_key UNIQUE (professional_id, deal_id);


--
-- Name: profile_images profile_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_images
    ADD CONSTRAINT profile_images_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: proof_of_funds proof_of_funds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_funds
    ADD CONSTRAINT proof_of_funds_pkey PRIMARY KEY (id);


--
-- Name: public_listings public_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_listings
    ADD CONSTRAINT public_listings_pkey PRIMARY KEY (id);


--
-- Name: public_listings public_listings_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_listings
    ADD CONSTRAINT public_listings_slug_key UNIQUE (slug);


--
-- Name: purchase_agreements purchase_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_agreements
    ADD CONSTRAINT purchase_agreements_pkey PRIMARY KEY (id);


--
-- Name: recast_add_backs recast_add_backs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recast_add_backs
    ADD CONSTRAINT recast_add_backs_pkey PRIMARY KEY (id);


--
-- Name: recast_projects recast_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recast_projects
    ADD CONSTRAINT recast_projects_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: relationship_edges relationship_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_edges
    ADD CONSTRAINT relationship_edges_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: sba_qualifications sba_qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sba_qualifications
    ADD CONSTRAINT sba_qualifications_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: search_log search_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_log
    ADD CONSTRAINT search_log_pkey PRIMARY KEY (id);


--
-- Name: seller_forms seller_forms_listing_id_form_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_forms
    ADD CONSTRAINT seller_forms_listing_id_form_type_key UNIQUE (listing_id, form_type);


--
-- Name: seller_forms seller_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_forms
    ADD CONSTRAINT seller_forms_pkey PRIMARY KEY (id);


--
-- Name: seller_forms seller_forms_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_forms
    ADD CONSTRAINT seller_forms_share_token_key UNIQUE (share_token);


--
-- Name: seller_leads seller_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_leads
    ADD CONSTRAINT seller_leads_pkey PRIMARY KEY (id);


--
-- Name: seller_listing_orders seller_listing_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_listing_orders
    ADD CONSTRAINT seller_listing_orders_pkey PRIMARY KEY (id);


--
-- Name: seller_readiness seller_readiness_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_readiness
    ADD CONSTRAINT seller_readiness_listing_id_key UNIQUE (listing_id);


--
-- Name: seller_readiness seller_readiness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_readiness
    ADD CONSTRAINT seller_readiness_pkey PRIMARY KEY (id);


--
-- Name: social_analytics social_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_analytics
    ADD CONSTRAINT social_analytics_pkey PRIMARY KEY (id);


--
-- Name: social_connections social_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_connections
    ADD CONSTRAINT social_connections_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: social_settings social_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_settings
    ADD CONSTRAINT social_settings_pkey PRIMARY KEY (id);


--
-- Name: sold_comps sold_comps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_comps
    ADD CONSTRAINT sold_comps_pkey PRIMARY KEY (id);


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: syndication_offers syndication_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndication_offers
    ADD CONSTRAINT syndication_offers_pkey PRIMARY KEY (id);


--
-- Name: team_invites team_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_pkey PRIMARY KEY (id);


--
-- Name: team_invites team_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_token_key UNIQUE (token);


--
-- Name: training_certificates training_certificates_broker_id_module_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_certificates
    ADD CONSTRAINT training_certificates_broker_id_module_id_key UNIQUE (broker_id, module_id);


--
-- Name: training_certificates training_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_certificates
    ADD CONSTRAINT training_certificates_pkey PRIMARY KEY (id);


--
-- Name: training_gamification training_gamification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_gamification
    ADD CONSTRAINT training_gamification_pkey PRIMARY KEY (broker_id);


--
-- Name: training_lesson_media training_lesson_media_lesson_id_media_type_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lesson_media
    ADD CONSTRAINT training_lesson_media_lesson_id_media_type_order_key UNIQUE (lesson_id, media_type, "order");


--
-- Name: training_lesson_media training_lesson_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lesson_media
    ADD CONSTRAINT training_lesson_media_pkey PRIMARY KEY (id);


--
-- Name: training_lessons training_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lessons
    ADD CONSTRAINT training_lessons_pkey PRIMARY KEY (id);


--
-- Name: training_modules training_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_modules
    ADD CONSTRAINT training_modules_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_broker_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_progress
    ADD CONSTRAINT training_progress_broker_id_lesson_id_key UNIQUE (broker_id, lesson_id);


--
-- Name: training_progress training_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_progress
    ADD CONSTRAINT training_progress_pkey PRIMARY KEY (id);


--
-- Name: training_quiz_questions training_quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_quiz_questions
    ADD CONSTRAINT training_quiz_questions_pkey PRIMARY KEY (id);


--
-- Name: training_uploads training_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_uploads
    ADD CONSTRAINT training_uploads_pkey PRIMARY KEY (id);


--
-- Name: transition_plans transition_plans_deal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_plans
    ADD CONSTRAINT transition_plans_deal_id_key UNIQUE (deal_id);


--
-- Name: transition_plans transition_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_plans
    ADD CONSTRAINT transition_plans_pkey PRIMARY KEY (id);


--
-- Name: trial_settings trial_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_settings
    ADD CONSTRAINT trial_settings_pkey PRIMARY KEY (id);


--
-- Name: trust_center_settings trust_center_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_center_settings
    ADD CONSTRAINT trust_center_settings_pkey PRIMARY KEY (agency_id);


--
-- Name: valuation_estimates valuation_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_estimates
    ADD CONSTRAINT valuation_estimates_pkey PRIMARY KEY (id);


--
-- Name: valuation_reports valuation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_reports
    ADD CONSTRAINT valuation_reports_pkey PRIMARY KEY (id);


--
-- Name: value_growth_plans value_growth_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.value_growth_plans
    ADD CONSTRAINT value_growth_plans_pkey PRIMARY KEY (id);


--
-- Name: verified_financials verified_financials_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_financials
    ADD CONSTRAINT verified_financials_listing_id_key UNIQUE (listing_id);


--
-- Name: verified_financials verified_financials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_financials
    ADD CONSTRAINT verified_financials_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_action_idx ON public.admin_audit_log USING btree (action);


--
-- Name: admin_audit_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_actor_idx ON public.admin_audit_log USING btree (actor_id);


--
-- Name: admin_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_created_idx ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: admin_audit_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_target_idx ON public.admin_audit_log USING btree (target_type, target_id);


--
-- Name: agency_onboarding_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agency_onboarding_status_idx ON public.agency_onboarding USING btree (status);


--
-- Name: agent_agreements_broker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_agreements_broker_idx ON public.agent_agreements USING btree (broker_id);


--
-- Name: agent_applications_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_applications_status_idx ON public.agent_applications USING btree (status);


--
-- Name: agent_performance_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_performance_agent_idx ON public.agent_performance USING btree (agent_id);


--
-- Name: ai_actions_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_actions_agency_status_idx ON public.ai_actions USING btree (agency_id, status, created_at DESC);


--
-- Name: ai_approvals_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_approvals_pending_idx ON public.ai_approvals USING btree (agency_id, status, created_at DESC);


--
-- Name: app_notifications_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_notifications_agency_idx ON public.app_notifications USING btree (agency_id, created_at DESC);


--
-- Name: app_notifications_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_notifications_profile_idx ON public.app_notifications USING btree (profile_id, read_at, created_at DESC);


--
-- Name: appointments_agency_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_agency_start_idx ON public.appointments USING btree (agency_id, starts_at);


--
-- Name: appointments_assigned_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_assigned_start_idx ON public.appointments USING btree (assigned_to, starts_at);


--
-- Name: auto_gen_logs_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auto_gen_logs_doc_idx ON public.auto_generation_logs USING btree (financial_document_id);


--
-- Name: auto_gen_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auto_gen_logs_status_idx ON public.auto_generation_logs USING btree (status);


--
-- Name: bli_versions_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bli_versions_listing_idx ON public.bli_versions USING btree (listing_id);


--
-- Name: bookmarks_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_buyer_idx ON public.buyer_bookmarked_listings USING btree (buyer_profile_id, created_at DESC);


--
-- Name: bov_versions_listing_idx2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bov_versions_listing_idx2 ON public.bov_versions USING btree (listing_id);


--
-- Name: broker_financial_files_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broker_financial_files_deal_idx ON public.broker_financial_files USING btree (deal_id);


--
-- Name: broker_financial_files_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broker_financial_files_listing_idx ON public.broker_financial_files USING btree (listing_id);


--
-- Name: buyer_engagement_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_engagement_listing_idx ON public.buyer_engagement_scores USING btree (listing_id, engagement_score DESC);


--
-- Name: buyer_leads_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_leads_agency_id_idx ON public.buyer_leads USING btree (agency_id);


--
-- Name: buyer_leads_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_leads_fts_idx ON public.buyer_leads USING gin (fts_document);


--
-- Name: buyer_lists_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_lists_listing_idx ON public.buyer_lists USING btree (listing_id);


--
-- Name: buyer_lists_pipeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_lists_pipeline_idx ON public.buyer_lists USING btree (listing_id, pipeline_stage);


--
-- Name: buyer_match_events_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_match_events_agency_idx ON public.buyer_match_events USING btree (agency_id, status, created_at DESC);


--
-- Name: buyer_match_events_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_match_events_buyer_idx ON public.buyer_match_events USING btree (buyer_profile_id, created_at DESC);


--
-- Name: buyer_nqa_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_nqa_buyer_idx ON public.buyer_nqa_responses USING btree (buyer_list_id);


--
-- Name: buyer_pipeline_events_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_pipeline_events_agency_idx ON public.buyer_pipeline_events USING btree (agency_id, created_at DESC);


--
-- Name: buyer_pipeline_events_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_pipeline_events_buyer_idx ON public.buyer_pipeline_events USING btree (buyer_list_id, created_at DESC);


--
-- Name: buyer_search_profiles_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_search_profiles_match_idx ON public.buyer_search_profiles USING btree (active, max_price, min_revenue, min_sde);


--
-- Name: call_sessions_agency_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_sessions_agency_created_idx ON public.call_sessions USING btree (agency_id, created_at DESC);


--
-- Name: call_summaries_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_summaries_agency_idx ON public.call_summaries USING btree (agency_id, created_at DESC);


--
-- Name: call_transcripts_call_sequence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_transcripts_call_sequence_idx ON public.call_transcripts USING btree (call_session_id, sequence);


--
-- Name: cim_versions_listing_idx2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cim_versions_listing_idx2 ON public.cim_versions USING btree (listing_id);


--
-- Name: client_portal_access_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_access_deal_idx ON public.client_portal_access USING btree (deal_id);


--
-- Name: client_portal_access_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_access_token_idx ON public.client_portal_access USING btree (token);


--
-- Name: closing_milestones_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closing_milestones_agency_idx ON public.deal_closing_milestones USING btree (agency_id, listing_id, sort_order);


--
-- Name: closing_milestones_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closing_milestones_due_idx ON public.deal_closing_milestones USING btree (listing_id, due_date);


--
-- Name: commission_records_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commission_records_agency_status_idx ON public.commission_records USING btree (agency_id, status, created_at DESC);


--
-- Name: communications_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_agency_idx ON public.communications USING btree (agency_id, created_at DESC);


--
-- Name: communications_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_buyer_idx ON public.communications USING btree (buyer_lead_id, created_at DESC);


--
-- Name: communications_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_deal_idx ON public.communications USING btree (deal_id, created_at DESC);


--
-- Name: communications_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_listing_idx ON public.communications USING btree (listing_id, created_at DESC);


--
-- Name: communications_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_seller_idx ON public.communications USING btree (seller_lead_id, created_at DESC);


--
-- Name: contractor_payments_contractor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contractor_payments_contractor_idx ON public.contractor_payments USING btree (contractor_id, payment_date DESC);


--
-- Name: contractor_payments_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contractor_payments_date_idx ON public.contractor_payments USING btree (payment_date DESC);


--
-- Name: contractors_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contractors_active_idx ON public.contractors USING btree (active, legal_name);


--
-- Name: contractors_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contractors_agency_idx ON public.contractors USING btree (agency_id);


--
-- Name: data_room_ai_queries_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_room_ai_queries_room_idx ON public.data_room_ai_queries USING btree (data_room_id, created_at DESC);


--
-- Name: data_room_qa_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_room_qa_agency_idx ON public.data_room_qa USING btree (agency_id, created_at DESC);


--
-- Name: data_room_qa_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_room_qa_room_idx ON public.data_room_qa USING btree (data_room_id, created_at DESC);


--
-- Name: deal_agreements_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_agreements_listing_idx ON public.deal_agreements USING btree (listing_id);


--
-- Name: deal_closing_details_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_closing_details_listing_idx ON public.deal_closing_details USING btree (listing_id);


--
-- Name: deal_commissions_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_commissions_listing_idx ON public.deal_commissions USING btree (listing_id);


--
-- Name: deal_digests_agency_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_digests_agency_created_idx ON public.deal_digests USING btree (agency_id, generated_at DESC);


--
-- Name: deal_documents_recycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_documents_recycle_idx ON public.deal_documents USING btree (is_deleted, deleted_at DESC);


--
-- Name: deal_fact_evidence_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_fact_evidence_listing_idx ON public.deal_fact_evidence USING btree (listing_id, verification_level);


--
-- Name: deal_notify_subscriptions_agency_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_notify_subscriptions_agency_email_idx ON public.deal_notify_subscriptions USING btree (agency_id, email);


--
-- Name: deal_offers_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_offers_listing_idx ON public.deal_offers USING btree (listing_id, status, seller_value_score DESC);


--
-- Name: deal_professionals_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_professionals_active_idx ON public.deal_professionals USING btree (is_active);


--
-- Name: deal_professionals_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_professionals_country_idx ON public.deal_professionals USING btree (country_code);


--
-- Name: deal_professionals_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_professionals_type_idx ON public.deal_professionals USING btree (professional_type);


--
-- Name: deal_twin_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_twin_agency_idx ON public.deal_twin_snapshots USING btree (agency_id, computed_at DESC);


--
-- Name: deal_twin_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_twin_score_idx ON public.deal_twin_snapshots USING btree (health_score DESC);


--
-- Name: deal_twins_agency_health_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_twins_agency_health_idx ON public.deal_twins USING btree (agency_id, health_score);


--
-- Name: deal_twins_deal_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deal_twins_deal_unique_idx ON public.deal_twins USING btree (agency_id, deal_id) WHERE ((deal_id IS NOT NULL) AND (listing_id IS NULL));


--
-- Name: deal_twins_listing_deal_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deal_twins_listing_deal_unique_idx ON public.deal_twins USING btree (agency_id, listing_id, deal_id) WHERE ((listing_id IS NOT NULL) AND (deal_id IS NOT NULL));


--
-- Name: deal_twins_listing_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deal_twins_listing_unique_idx ON public.deal_twins USING btree (agency_id, listing_id) WHERE ((listing_id IS NOT NULL) AND (deal_id IS NULL));


--
-- Name: deals_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_agency_id_idx ON public.deals USING btree (agency_id);


--
-- Name: deals_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_fts_idx ON public.deals USING gin (fts_document);


--
-- Name: dr_activities_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_activities_created_idx ON public.data_room_activities USING btree (created_at DESC);


--
-- Name: dr_activities_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_activities_room_idx ON public.data_room_activities USING btree (data_room_id);


--
-- Name: dr_buyers_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_buyers_room_idx ON public.data_room_buyers USING btree (data_room_id);


--
-- Name: dr_comments_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_comments_file_idx ON public.data_room_comments USING btree (file_id);


--
-- Name: dr_dl_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_dl_file_idx ON public.data_room_download_logs USING btree (file_id);


--
-- Name: dr_files_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_files_deleted_idx ON public.data_room_files USING btree (is_deleted);


--
-- Name: dr_files_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_files_folder_idx ON public.data_room_files USING btree (folder_id);


--
-- Name: dr_files_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_files_room_idx ON public.data_room_files USING btree (data_room_id);


--
-- Name: dr_folders_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_folders_parent_idx ON public.data_room_folders USING btree (parent_folder_id);


--
-- Name: dr_folders_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_folders_room_idx ON public.data_room_folders USING btree (data_room_id);


--
-- Name: dr_shares_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_shares_email_idx ON public.data_room_shares USING btree (shared_with);


--
-- Name: dr_shares_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_shares_room_idx ON public.data_room_shares USING btree (data_room_id);


--
-- Name: dr_trash_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_trash_deleted_idx ON public.data_room_trash USING btree (deleted_at);


--
-- Name: dr_viewlogs_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_viewlogs_email_idx ON public.data_room_view_logs USING btree (viewer_email);


--
-- Name: dr_viewlogs_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dr_viewlogs_file_idx ON public.data_room_view_logs USING btree (file_id);


--
-- Name: email_emails_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_emails_kind_idx ON public.email_emails USING btree (kind);


--
-- Name: email_emails_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_emails_status_idx ON public.email_emails USING btree (status);


--
-- Name: email_templates_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_agency_idx ON public.email_templates USING btree (agency_id, category);


--
-- Name: escrow_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_agency_idx ON public.deal_escrow_accounts USING btree (agency_id, listing_id, status);


--
-- Name: exchange_opportunities_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_opportunities_status_idx ON public.exchange_opportunities USING btree (status, expires_at);


--
-- Name: expenses_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_agency_idx ON public.expenses USING btree (agency_id);


--
-- Name: expenses_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_category_idx ON public.expenses USING btree (category);


--
-- Name: expenses_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_date_idx ON public.expenses USING btree (expense_date DESC);


--
-- Name: expenses_vendor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_vendor_idx ON public.expenses USING btree (vendor);


--
-- Name: extraction_logs_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extraction_logs_doc_idx ON public.financial_extraction_logs USING btree (financial_document_id);


--
-- Name: financial_documents_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_category_idx ON public.financial_documents USING btree (category);


--
-- Name: financial_documents_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_deal_idx ON public.financial_documents USING btree (deal_id);


--
-- Name: financial_documents_doc_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_doc_type_idx ON public.financial_documents USING btree (document_type);


--
-- Name: financial_documents_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_listing_idx ON public.financial_documents USING btree (listing_id);


--
-- Name: financial_documents_processing_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_processing_status_idx ON public.financial_documents USING btree (processing_status);


--
-- Name: financial_documents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_status_idx ON public.financial_documents USING btree (status);


--
-- Name: financial_documents_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_uploaded_by_idx ON public.financial_documents USING btree (uploaded_by);


--
-- Name: financial_documents_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_documents_year_idx ON public.financial_documents USING btree (listing_id, fiscal_year);


--
-- Name: financial_extractions_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_extractions_doc_idx ON public.financial_extractions USING btree (document_id);


--
-- Name: financial_extractions_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_extractions_listing_idx ON public.financial_extractions USING btree (listing_id, fiscal_year);


--
-- Name: financial_history_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_history_listing_idx ON public.financial_history USING btree (listing_id);


--
-- Name: financial_interviews_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_interviews_listing_idx ON public.financial_interviews USING btree (listing_id);


--
-- Name: financial_ledger_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_ledger_listing_idx ON public.financial_ledger USING btree (listing_id, fiscal_year);


--
-- Name: hiring_packages_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hiring_packages_active_idx ON public.hiring_packages USING btree (is_active, commission_split DESC);


--
-- Name: lead_activities_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_activities_lead_id_idx ON public.lead_activities USING btree (lead_id);


--
-- Name: listing_call_clicks_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_call_clicks_listing_idx ON public.listing_call_clicks USING btree (listing_id, created_at DESC);


--
-- Name: listing_compliance_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_compliance_listing_idx ON public.listing_compliance_checks USING btree (listing_id);


--
-- Name: listing_documents_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_documents_listing_idx ON public.listing_documents USING btree (listing_id);


--
-- Name: listing_documents_recycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_documents_recycle_idx ON public.listing_documents USING btree (is_deleted, deleted_at DESC);


--
-- Name: listing_expirations_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_expirations_agency_idx ON public.listing_expirations USING btree (agency_id, status, expires_at);


--
-- Name: listing_financials_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_financials_listing_idx ON public.listing_financials USING btree (listing_id);


--
-- Name: listing_intakes_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_intakes_agency_status_idx ON public.listing_intakes USING btree (agency_id, status, created_at DESC);


--
-- Name: listing_nda_signatures_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_nda_signatures_email_idx ON public.listing_nda_signatures USING btree (buyer_email);


--
-- Name: listing_nda_signatures_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_nda_signatures_listing_idx ON public.listing_nda_signatures USING btree (listing_id);


--
-- Name: listing_nda_signatures_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_nda_signatures_token_idx ON public.listing_nda_signatures USING btree (unlock_token);


--
-- Name: listing_recasts_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_recasts_listing_idx ON public.listing_recasts USING btree (listing_id);


--
-- Name: listing_review_events_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_review_events_listing_idx ON public.listing_review_events USING btree (listing_id, created_at DESC);


--
-- Name: listing_views_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_agency_idx ON public.listing_views USING btree (agency_id, viewed_at DESC);


--
-- Name: listing_views_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_listing_idx ON public.listing_views USING btree (listing_id, viewed_at DESC);


--
-- Name: listing_views_visitor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_visitor_idx ON public.listing_views USING btree (visitor_id);


--
-- Name: listing_workflows_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_workflows_listing_idx ON public.listing_workflows USING btree (listing_id);


--
-- Name: listings_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_agency_id_idx ON public.listings USING btree (agency_id);


--
-- Name: listings_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_country_idx ON public.listings USING btree (country_code);


--
-- Name: listings_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_fts_idx ON public.listings USING gin (fts_document);


--
-- Name: listings_legitimacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_legitimacy_idx ON public.listings USING btree (legitimacy_verdict, financials_status);


--
-- Name: listings_owner_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_owner_email_idx ON public.listings USING btree (owner_email);


--
-- Name: listings_portal_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_portal_token_idx ON public.listings USING btree (portal_token);


--
-- Name: listings_ref_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listings_ref_uniq ON public.listings USING btree (listing_ref);


--
-- Name: locations_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_name_lower_idx ON public.locations USING btree (lower(name));


--
-- Name: locations_name_state_type_plain_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX locations_name_state_type_plain_uidx ON public.locations USING btree (name, state_code, place_type);


--
-- Name: locations_name_state_type_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX locations_name_state_type_uidx ON public.locations USING btree (lower(name), state_code, place_type);


--
-- Name: loi_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loi_agency_idx ON public.letters_of_intent USING btree (agency_id, created_at DESC);


--
-- Name: loi_offer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loi_offer_idx ON public.letters_of_intent USING btree (offer_id);


--
-- Name: loi_offer_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX loi_offer_uniq ON public.letters_of_intent USING btree (offer_id);


--
-- Name: lq_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lq_deal_idx ON public.lender_qualifications USING btree (deal_id);


--
-- Name: lq_lender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lq_lender_idx ON public.lender_qualifications USING btree (lender_id);


--
-- Name: lq_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lq_status_idx ON public.lender_qualifications USING btree (status);


--
-- Name: market_multiples_band_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX market_multiples_band_key ON public.market_multiples USING btree (industry, basis, min_multiple, max_multiple);


--
-- Name: marketing_products_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketing_products_name_key ON public.marketing_products USING btree (name);


--
-- Name: nda_requests_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nda_requests_agency_idx ON public.data_room_access_requests USING btree (agency_id, status, created_at DESC);


--
-- Name: nda_requests_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nda_requests_listing_idx ON public.nda_requests USING btree (listing_id);


--
-- Name: negotiation_drafts_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negotiation_drafts_agency_idx ON public.negotiation_drafts USING btree (agency_id, created_at DESC);


--
-- Name: negotiation_drafts_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negotiation_drafts_listing_idx ON public.negotiation_drafts USING btree (listing_id);


--
-- Name: negotiation_drafts_offer_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX negotiation_drafts_offer_uniq ON public.negotiation_drafts USING btree (offer_id);


--
-- Name: newspaper_articles_edition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_articles_edition_idx ON public.newspaper_articles USING btree (edition_id);


--
-- Name: newspaper_delivery_edition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_delivery_edition_idx ON public.newspaper_delivery_log USING btree (edition_id);


--
-- Name: newspaper_editions_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_editions_date_idx ON public.newspaper_editions USING btree (edition_date);


--
-- Name: newspaper_editions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_editions_status_idx ON public.newspaper_editions USING btree (status);


--
-- Name: newspaper_subs_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_subs_email_idx ON public.newspaper_subscriptions USING btree (email);


--
-- Name: newspaper_subs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newspaper_subs_status_idx ON public.newspaper_subscriptions USING btree (status);


--
-- Name: nurture_recipients_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nurture_recipients_agency_status_idx ON public.nurture_recipients USING btree (agency_id, status, created_at DESC);


--
-- Name: nurture_recipients_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nurture_recipients_due_idx ON public.nurture_recipients USING btree (sequence_id, next_send_at);


--
-- Name: nurture_sequences_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nurture_sequences_agency_idx ON public.nurture_sequences USING btree (agency_id, active, created_at DESC);


--
-- Name: password_vault_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_vault_profile_id_idx ON public.password_vault USING btree (profile_id);


--
-- Name: phone_verifications_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_verifications_phone_idx ON public.phone_verifications USING btree (phone, created_at DESC);


--
-- Name: portal_messages_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portal_messages_deal_idx ON public.portal_messages USING btree (deal_id);


--
-- Name: post_close_checkins_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_close_checkins_due_idx ON public.post_close_checkins USING btree (agency_id, status, due_at);


--
-- Name: post_close_checkins_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_close_checkins_listing_idx ON public.post_close_checkins USING btree (listing_id);


--
-- Name: professional_referral_fees_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professional_referral_fees_agency_idx ON public.professional_referral_fees USING btree (agency_id, status);


--
-- Name: professional_referral_fees_pro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professional_referral_fees_pro_idx ON public.professional_referral_fees USING btree (professional_id);


--
-- Name: proof_of_funds_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proof_of_funds_agency_status_idx ON public.proof_of_funds USING btree (agency_id, status, created_at DESC);


--
-- Name: proof_of_funds_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proof_of_funds_listing_idx ON public.proof_of_funds USING btree (listing_id);


--
-- Name: public_listings_listing_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX public_listings_listing_id_uniq ON public.public_listings USING btree (listing_id);


--
-- Name: recast_add_backs_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recast_add_backs_listing_idx ON public.recast_add_backs USING btree (listing_id);


--
-- Name: referrals_agency_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_agency_status_idx ON public.referrals USING btree (agency_id, status, created_at DESC);


--
-- Name: reminders_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_agency_idx ON public.reminders USING btree (agency_id, status, due_at);


--
-- Name: reminders_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_buyer_idx ON public.reminders USING btree (buyer_lead_id);


--
-- Name: reminders_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_deal_idx ON public.reminders USING btree (deal_id);


--
-- Name: reminders_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_listing_idx ON public.reminders USING btree (listing_id, due_at);


--
-- Name: reminders_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_seller_idx ON public.reminders USING btree (seller_lead_id);


--
-- Name: sba_qualifications_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sba_qualifications_listing_idx ON public.sba_qualifications USING btree (listing_id);


--
-- Name: seller_forms_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_forms_listing_id_idx ON public.seller_forms USING btree (listing_id);


--
-- Name: seller_leads_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_leads_agency_id_idx ON public.seller_leads USING btree (agency_id);


--
-- Name: seller_leads_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_leads_fts_idx ON public.seller_leads USING gin (fts_document);


--
-- Name: seller_leads_portal_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_leads_portal_token_idx ON public.seller_leads USING btree (portal_token);


--
-- Name: seller_listing_orders_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_listing_orders_agency_idx ON public.seller_listing_orders USING btree (agency_id, status, created_at DESC);


--
-- Name: seller_readiness_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_readiness_agency_idx ON public.seller_readiness USING btree (agency_id, updated_at DESC);


--
-- Name: seller_readiness_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_readiness_score_idx ON public.seller_readiness USING btree (readiness_score DESC);


--
-- Name: social_analytics_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_analytics_post_idx ON public.social_analytics USING btree (post_id);


--
-- Name: sold_comps_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sold_comps_agency_idx ON public.sold_comps USING btree (agency_id, industry, sold_at DESC);


--
-- Name: syndication_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX syndication_from_idx ON public.syndication_offers USING btree (from_agency_id, status);


--
-- Name: syndication_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX syndication_listing_idx ON public.syndication_offers USING btree (listing_id);


--
-- Name: syndication_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX syndication_to_idx ON public.syndication_offers USING btree (to_agency_id, status);


--
-- Name: team_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_invites_email_idx ON public.team_invites USING btree (email);


--
-- Name: team_invites_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_invites_token_idx ON public.team_invites USING btree (token);


--
-- Name: training_cert_broker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_cert_broker_idx ON public.training_certificates USING btree (broker_id);


--
-- Name: training_lessons_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_lessons_module_idx ON public.training_lessons USING btree (module_id);


--
-- Name: training_progress_broker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_progress_broker_idx ON public.training_progress USING btree (broker_id);


--
-- Name: training_progress_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_progress_lesson_idx ON public.training_progress USING btree (lesson_id);


--
-- Name: training_quiz_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_quiz_lesson_idx ON public.training_quiz_questions USING btree (lesson_id);


--
-- Name: training_uploads_broker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_uploads_broker_idx ON public.training_uploads USING btree (broker_id);


--
-- Name: valuation_estimates_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX valuation_estimates_agency_idx ON public.valuation_estimates USING btree (agency_id, created_at DESC);


--
-- Name: valuation_estimates_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX valuation_estimates_listing_idx ON public.valuation_estimates USING btree (listing_id, created_at DESC);


--
-- Name: verified_financials_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verified_financials_agency_idx ON public.verified_financials USING btree (agency_id, status);


--
-- Name: watchlist_searches_agency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watchlist_searches_agency_idx ON public.buyer_watchlist_searches USING btree (agency_id, active, created_at DESC);


--
-- Name: watchlist_searches_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watchlist_searches_buyer_idx ON public.buyer_watchlist_searches USING btree (buyer_profile_id, created_at DESC);


--
-- Name: listings auto_match_buyers_on_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_match_buyers_on_approval AFTER INSERT OR UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION public.match_buyers_for_listing();


--
-- Name: financial_documents auto_process_financial_document; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_process_financial_document BEFORE INSERT ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.auto_process_financial_document();


--
-- Name: listings auto_set_primary_image; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_set_primary_image BEFORE INSERT OR UPDATE OF image_urls ON public.listings FOR EACH ROW EXECUTE FUNCTION public.auto_set_primary_image();


--
-- Name: financial_documents auto_update_financial_document; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_update_financial_document BEFORE INSERT ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.update_financial_document_status();


--
-- Name: buyer_leads buyer_leads_assign_agency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER buyer_leads_assign_agency BEFORE INSERT ON public.buyer_leads FOR EACH ROW EXECUTE FUNCTION public.assign_buyer_lead_agency();


--
-- Name: deal_professionals deal_professionals_advertised_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER deal_professionals_advertised_check BEFORE INSERT OR UPDATE ON public.deal_professionals FOR EACH ROW EXECUTE FUNCTION public.check_professional_advertised();


--
-- Name: deals deals_assign_agency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER deals_assign_agency BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.assign_deal_agency();


--
-- Name: listings listings_assign_agency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_assign_agency BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.assign_listing_agency();


--
-- Name: listings listings_assign_ref; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_assign_ref BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.assign_listing_ref();


--
-- Name: seller_leads seller_leads_assign_agency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seller_leads_assign_agency BEFORE INSERT ON public.seller_leads FOR EACH ROW EXECUTE FUNCTION public.assign_seller_lead_agency();


--
-- Name: public_listings trg_enforce_listing_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_listing_approved BEFORE INSERT OR UPDATE ON public.public_listings FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_approved_before_publish();


--
-- Name: deals update_deal_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_deal_timestamp BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_deal_timestamp();


--
-- Name: listings update_listing_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_listing_timestamp BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.update_listing_timestamp();


--
-- Name: activities activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: agency_ai_providers agency_ai_providers_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_ai_providers
    ADD CONSTRAINT agency_ai_providers_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agency_members agency_members_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_members
    ADD CONSTRAINT agency_members_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agency_members agency_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_members
    ADD CONSTRAINT agency_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agency_onboarding agency_onboarding_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_onboarding
    ADD CONSTRAINT agency_onboarding_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agency_settings agency_settings_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT agency_settings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agency_site_themes agency_site_themes_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_site_themes
    ADD CONSTRAINT agency_site_themes_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agent_agreements agent_agreements_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_agreements
    ADD CONSTRAINT agent_agreements_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_applications agent_applications_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_applications
    ADD CONSTRAINT agent_applications_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.hiring_packages(id) ON DELETE SET NULL;


--
-- Name: agent_applications agent_applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_applications
    ADD CONSTRAINT agent_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: agent_contact_requests agent_contact_requests_preferred_agent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_contact_requests
    ADD CONSTRAINT agent_contact_requests_preferred_agent_fkey FOREIGN KEY (preferred_agent) REFERENCES public.profiles(id);


--
-- Name: agent_performance agent_performance_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance
    ADD CONSTRAINT agent_performance_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_performance_snapshots agent_performance_snapshots_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance_snapshots
    ADD CONSTRAINT agent_performance_snapshots_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agent_performance_snapshots agent_performance_snapshots_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_performance_snapshots
    ADD CONSTRAINT agent_performance_snapshots_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: ai_actions ai_actions_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: ai_actions ai_actions_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ai_actions ai_actions_call_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_call_session_id_fkey FOREIGN KEY (call_session_id) REFERENCES public.call_sessions(id) ON DELETE SET NULL;


--
-- Name: ai_actions ai_actions_deal_twin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_deal_twin_id_fkey FOREIGN KEY (deal_twin_id) REFERENCES public.deal_twins(id) ON DELETE SET NULL;


--
-- Name: ai_actions ai_actions_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ai_agent_config ai_agent_config_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_config
    ADD CONSTRAINT ai_agent_config_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: ai_approvals ai_approvals_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_approvals
    ADD CONSTRAINT ai_approvals_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.ai_actions(id) ON DELETE CASCADE;


--
-- Name: ai_approvals ai_approvals_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_approvals
    ADD CONSTRAINT ai_approvals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: ai_approvals ai_approvals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_approvals
    ADD CONSTRAINT ai_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ai_approvals ai_approvals_requested_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_approvals
    ADD CONSTRAINT ai_approvals_requested_from_fkey FOREIGN KEY (requested_from) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ai_prompt_versions ai_prompt_versions_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_versions
    ADD CONSTRAINT ai_prompt_versions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: ai_prompt_versions ai_prompt_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_versions
    ADD CONSTRAINT ai_prompt_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: app_notifications app_notifications_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: app_notifications app_notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE SET NULL;


--
-- Name: auto_generation_logs auto_generation_logs_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_generation_logs
    ADD CONSTRAINT auto_generation_logs_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE CASCADE;


--
-- Name: bli_versions bli_versions_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bli_versions
    ADD CONSTRAINT bli_versions_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: bli_versions bli_versions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bli_versions
    ADD CONSTRAINT bli_versions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: bov_versions bov_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bov_versions
    ADD CONSTRAINT bov_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: bov_versions bov_versions_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bov_versions
    ADD CONSTRAINT bov_versions_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: bov_versions bov_versions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bov_versions
    ADD CONSTRAINT bov_versions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: broker_financial_files broker_financial_files_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_financial_files
    ADD CONSTRAINT broker_financial_files_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: broker_financial_files broker_financial_files_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_financial_files
    ADD CONSTRAINT broker_financial_files_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: broker_financial_files broker_financial_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_financial_files
    ADD CONSTRAINT broker_financial_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: broker_profiles broker_profiles_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_profiles
    ADD CONSTRAINT broker_profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;


--
-- Name: broker_profiles broker_profiles_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_profiles
    ADD CONSTRAINT broker_profiles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: buyer_bookmarked_listings buyer_bookmarked_listings_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_bookmarked_listings
    ADD CONSTRAINT buyer_bookmarked_listings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_bookmarked_listings buyer_bookmarked_listings_buyer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_bookmarked_listings
    ADD CONSTRAINT buyer_bookmarked_listings_buyer_profile_id_fkey FOREIGN KEY (buyer_profile_id) REFERENCES public.buyer_search_profiles(id) ON DELETE CASCADE;


--
-- Name: buyer_bookmarked_listings buyer_bookmarked_listings_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_bookmarked_listings
    ADD CONSTRAINT buyer_bookmarked_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_engagement_scores buyer_engagement_scores_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_engagement_scores buyer_engagement_scores_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE CASCADE;


--
-- Name: buyer_engagement_scores buyer_engagement_scores_data_room_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_data_room_buyer_id_fkey FOREIGN KEY (data_room_buyer_id) REFERENCES public.data_room_buyers(id) ON DELETE SET NULL;


--
-- Name: buyer_engagement_scores buyer_engagement_scores_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_engagement_scores
    ADD CONSTRAINT buyer_engagement_scores_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_leads buyer_leads_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_leads
    ADD CONSTRAINT buyer_leads_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;


--
-- Name: buyer_leads buyer_leads_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_leads
    ADD CONSTRAINT buyer_leads_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: buyer_lists buyer_lists_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_lists
    ADD CONSTRAINT buyer_lists_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE SET NULL;


--
-- Name: buyer_lists buyer_lists_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_lists
    ADD CONSTRAINT buyer_lists_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_match_events buyer_match_events_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_match_events
    ADD CONSTRAINT buyer_match_events_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_match_events buyer_match_events_buyer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_match_events
    ADD CONSTRAINT buyer_match_events_buyer_profile_id_fkey FOREIGN KEY (buyer_profile_id) REFERENCES public.buyer_search_profiles(id) ON DELETE CASCADE;


--
-- Name: buyer_match_events buyer_match_events_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_match_events
    ADD CONSTRAINT buyer_match_events_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_nqa_responses buyer_nqa_responses_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_nqa_responses
    ADD CONSTRAINT buyer_nqa_responses_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_nqa_responses buyer_nqa_responses_buyer_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_nqa_responses
    ADD CONSTRAINT buyer_nqa_responses_buyer_list_id_fkey FOREIGN KEY (buyer_list_id) REFERENCES public.buyer_lists(id) ON DELETE CASCADE;


--
-- Name: buyer_nqa_responses buyer_nqa_responses_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_nqa_responses
    ADD CONSTRAINT buyer_nqa_responses_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_pipeline_events buyer_pipeline_events_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_pipeline_events
    ADD CONSTRAINT buyer_pipeline_events_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_pipeline_events buyer_pipeline_events_buyer_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_pipeline_events
    ADD CONSTRAINT buyer_pipeline_events_buyer_list_id_fkey FOREIGN KEY (buyer_list_id) REFERENCES public.buyer_lists(id) ON DELETE CASCADE;


--
-- Name: buyer_pipeline_events buyer_pipeline_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_pipeline_events
    ADD CONSTRAINT buyer_pipeline_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: buyer_pipeline_events buyer_pipeline_events_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_pipeline_events
    ADD CONSTRAINT buyer_pipeline_events_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: buyer_search_profiles buyer_search_profiles_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_search_profiles
    ADD CONSTRAINT buyer_search_profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_search_profiles buyer_search_profiles_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_search_profiles
    ADD CONSTRAINT buyer_search_profiles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: buyer_subscriptions buyer_subscriptions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_subscriptions
    ADD CONSTRAINT buyer_subscriptions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: buyer_watchlist_searches buyer_watchlist_searches_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_watchlist_searches
    ADD CONSTRAINT buyer_watchlist_searches_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: buyer_watchlist_searches buyer_watchlist_searches_buyer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_watchlist_searches
    ADD CONSTRAINT buyer_watchlist_searches_buyer_profile_id_fkey FOREIGN KEY (buyer_profile_id) REFERENCES public.buyer_search_profiles(id) ON DELETE CASCADE;


--
-- Name: calendar_connections calendar_connections_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: calendar_connections calendar_connections_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: call_sessions call_sessions_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: call_sessions call_sessions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: call_sessions call_sessions_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: call_sessions call_sessions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: call_sessions call_sessions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: call_sessions call_sessions_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE SET NULL;


--
-- Name: call_summaries call_summaries_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_summaries
    ADD CONSTRAINT call_summaries_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: call_summaries call_summaries_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_summaries
    ADD CONSTRAINT call_summaries_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.call_sessions(id) ON DELETE CASCADE;


--
-- Name: call_transcripts call_transcripts_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: call_transcripts call_transcripts_call_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_call_session_id_fkey FOREIGN KEY (call_session_id) REFERENCES public.call_sessions(id) ON DELETE CASCADE;


--
-- Name: cim_versions cim_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cim_versions
    ADD CONSTRAINT cim_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: cim_versions cim_versions_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cim_versions
    ADD CONSTRAINT cim_versions_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cim_versions cim_versions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cim_versions
    ADD CONSTRAINT cim_versions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: client_portal_access client_portal_access_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access
    ADD CONSTRAINT client_portal_access_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: client_portal_access client_portal_access_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access
    ADD CONSTRAINT client_portal_access_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: commission_records commission_records_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_records
    ADD CONSTRAINT commission_records_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: commission_records commission_records_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_records
    ADD CONSTRAINT commission_records_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: commission_records commission_records_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_records
    ADD CONSTRAINT commission_records_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: commission_records commission_records_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_records
    ADD CONSTRAINT commission_records_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: communications communications_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: communications communications_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE CASCADE;


--
-- Name: communications communications_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: communications communications_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: communications communications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: communications communications_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE CASCADE;


--
-- Name: contractor_payments contractor_payments_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;


--
-- Name: contractor_payments contractor_payments_commission_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_commission_record_id_fkey FOREIGN KEY (commission_record_id) REFERENCES public.commission_records(id) ON DELETE SET NULL;


--
-- Name: contractor_payments contractor_payments_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: contractor_payments contractor_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contractor_payments contractor_payments_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractor_payments
    ADD CONSTRAINT contractor_payments_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: contractors contractors_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;


--
-- Name: contractors contractors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contractors contractors_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_access_requests data_room_access_requests_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_requests
    ADD CONSTRAINT data_room_access_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: data_room_access_requests data_room_access_requests_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_requests
    ADD CONSTRAINT data_room_access_requests_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_access_requests data_room_access_requests_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_requests
    ADD CONSTRAINT data_room_access_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: data_room_access_requests data_room_access_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_requests
    ADD CONSTRAINT data_room_access_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_activities data_room_activities_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_activities
    ADD CONSTRAINT data_room_activities_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_activities data_room_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_activities
    ADD CONSTRAINT data_room_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_ai_queries data_room_ai_queries_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_ai_queries
    ADD CONSTRAINT data_room_ai_queries_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: data_room_ai_queries data_room_ai_queries_asked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_ai_queries
    ADD CONSTRAINT data_room_ai_queries_asked_by_fkey FOREIGN KEY (asked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_ai_queries data_room_ai_queries_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_ai_queries
    ADD CONSTRAINT data_room_ai_queries_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.data_room_buyers(id) ON DELETE SET NULL;


--
-- Name: data_room_ai_queries data_room_ai_queries_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_ai_queries
    ADD CONSTRAINT data_room_ai_queries_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_buyers data_room_buyers_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_buyers
    ADD CONSTRAINT data_room_buyers_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_buyers data_room_buyers_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_buyers
    ADD CONSTRAINT data_room_buyers_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_comments data_room_comments_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_comments
    ADD CONSTRAINT data_room_comments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.data_room_files(id) ON DELETE CASCADE;


--
-- Name: data_room_comments data_room_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_comments
    ADD CONSTRAINT data_room_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_download_logs data_room_download_logs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_download_logs
    ADD CONSTRAINT data_room_download_logs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.data_room_files(id) ON DELETE CASCADE;


--
-- Name: data_room_files data_room_files_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_files data_room_files_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_files data_room_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.data_room_folders(id) ON DELETE SET NULL;


--
-- Name: data_room_files data_room_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_folders data_room_folders_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_folders
    ADD CONSTRAINT data_room_folders_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_folders data_room_folders_parent_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_folders
    ADD CONSTRAINT data_room_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.data_room_folders(id) ON DELETE CASCADE;


--
-- Name: data_room_qa data_room_qa_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_qa
    ADD CONSTRAINT data_room_qa_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: data_room_qa data_room_qa_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_qa
    ADD CONSTRAINT data_room_qa_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_shares data_room_shares_data_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_shares
    ADD CONSTRAINT data_room_shares_data_room_id_fkey FOREIGN KEY (data_room_id) REFERENCES public.data_rooms(id) ON DELETE CASCADE;


--
-- Name: data_room_shares data_room_shares_shared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_shares
    ADD CONSTRAINT data_room_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_trash data_room_trash_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_trash
    ADD CONSTRAINT data_room_trash_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_trash data_room_trash_restored_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_trash
    ADD CONSTRAINT data_room_trash_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_room_view_logs data_room_view_logs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_view_logs
    ADD CONSTRAINT data_room_view_logs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.data_room_files(id) ON DELETE CASCADE;


--
-- Name: data_rooms data_rooms_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_rooms
    ADD CONSTRAINT data_rooms_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: data_rooms data_rooms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_rooms
    ADD CONSTRAINT data_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: data_rooms data_rooms_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_rooms
    ADD CONSTRAINT data_rooms_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: data_rooms data_rooms_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_rooms
    ADD CONSTRAINT data_rooms_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_agreements deal_agreements_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyer_lists(id) ON DELETE SET NULL;


--
-- Name: deal_agreements deal_agreements_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_closing_details deal_closing_details_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_details
    ADD CONSTRAINT deal_closing_details_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_closing_details deal_closing_details_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_details
    ADD CONSTRAINT deal_closing_details_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_closing_details deal_closing_details_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_details
    ADD CONSTRAINT deal_closing_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_closing_milestones deal_closing_milestones_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_milestones
    ADD CONSTRAINT deal_closing_milestones_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_closing_milestones deal_closing_milestones_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_milestones
    ADD CONSTRAINT deal_closing_milestones_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_closing_milestones deal_closing_milestones_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_milestones
    ADD CONSTRAINT deal_closing_milestones_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: deal_closing_milestones deal_closing_milestones_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_closing_milestones
    ADD CONSTRAINT deal_closing_milestones_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_commissions deal_commissions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_commissions
    ADD CONSTRAINT deal_commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_commissions deal_commissions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_commissions
    ADD CONSTRAINT deal_commissions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_commissions deal_commissions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_commissions
    ADD CONSTRAINT deal_commissions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_contacts deal_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: deal_contacts deal_contacts_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_digests deal_digests_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_digests
    ADD CONSTRAINT deal_digests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_documents deal_documents_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_documents
    ADD CONSTRAINT deal_documents_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_documents deal_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_documents
    ADD CONSTRAINT deal_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: deal_escrow_accounts deal_escrow_accounts_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_escrow_accounts
    ADD CONSTRAINT deal_escrow_accounts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_escrow_accounts deal_escrow_accounts_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_escrow_accounts
    ADD CONSTRAINT deal_escrow_accounts_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: deal_escrow_accounts deal_escrow_accounts_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_escrow_accounts
    ADD CONSTRAINT deal_escrow_accounts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_fact_evidence deal_fact_evidence_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_fact_evidence deal_fact_evidence_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_fact_evidence deal_fact_evidence_passport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_passport_id_fkey FOREIGN KEY (passport_id) REFERENCES public.deal_passports(id) ON DELETE CASCADE;


--
-- Name: deal_fact_evidence deal_fact_evidence_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_fact_evidence
    ADD CONSTRAINT deal_fact_evidence_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_notify_subscriptions deal_notify_subscriptions_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_notify_subscriptions
    ADD CONSTRAINT deal_notify_subscriptions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_offers deal_offers_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_offers
    ADD CONSTRAINT deal_offers_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_offers deal_offers_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_offers
    ADD CONSTRAINT deal_offers_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE SET NULL;


--
-- Name: deal_offers deal_offers_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_offers
    ADD CONSTRAINT deal_offers_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: deal_offers deal_offers_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_offers
    ADD CONSTRAINT deal_offers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_passports deal_passports_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_passports
    ADD CONSTRAINT deal_passports_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_passports deal_passports_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_passports
    ADD CONSTRAINT deal_passports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_professionals deal_professionals_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_professionals
    ADD CONSTRAINT deal_professionals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_success_fees deal_success_fees_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_success_fees
    ADD CONSTRAINT deal_success_fees_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_success_fees deal_success_fees_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_success_fees
    ADD CONSTRAINT deal_success_fees_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: deal_success_fees deal_success_fees_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_success_fees
    ADD CONSTRAINT deal_success_fees_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_twin_snapshots deal_twin_snapshots_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twin_snapshots
    ADD CONSTRAINT deal_twin_snapshots_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_twin_snapshots deal_twin_snapshots_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twin_snapshots
    ADD CONSTRAINT deal_twin_snapshots_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: deal_twin_snapshots deal_twin_snapshots_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twin_snapshots
    ADD CONSTRAINT deal_twin_snapshots_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deal_twins deal_twins_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twins
    ADD CONSTRAINT deal_twins_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: deal_twins deal_twins_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twins
    ADD CONSTRAINT deal_twins_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_twins deal_twins_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_twins
    ADD CONSTRAINT deal_twins_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: deals deals_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;


--
-- Name: deals deals_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id);


--
-- Name: deals deals_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: document_audit_logs document_audit_logs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_audit_logs
    ADD CONSTRAINT document_audit_logs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_signatures document_signatures_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT document_signatures_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_templates(id) ON DELETE SET NULL;


--
-- Name: due_diligence_items due_diligence_items_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.due_diligence_items
    ADD CONSTRAINT due_diligence_items_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: due_diligence_items due_diligence_items_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.due_diligence_items
    ADD CONSTRAINT due_diligence_items_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: exchange_opportunities exchange_opportunities_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_opportunities
    ADD CONSTRAINT exchange_opportunities_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE CASCADE;


--
-- Name: exchange_opportunities exchange_opportunities_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_opportunities
    ADD CONSTRAINT exchange_opportunities_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: exchange_opportunities exchange_opportunities_origin_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_opportunities
    ADD CONSTRAINT exchange_opportunities_origin_agency_id_fkey FOREIGN KEY (origin_agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: exchange_partnerships exchange_partnerships_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_partnerships
    ADD CONSTRAINT exchange_partnerships_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: exchange_partnerships exchange_partnerships_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_partnerships
    ADD CONSTRAINT exchange_partnerships_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: exchange_partnerships exchange_partnerships_partner_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_partnerships
    ADD CONSTRAINT exchange_partnerships_partner_agency_id_fkey FOREIGN KEY (partner_agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: featured_slots featured_slots_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_slots
    ADD CONSTRAINT featured_slots_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: featured_slots featured_slots_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_slots
    ADD CONSTRAINT featured_slots_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_documents financial_documents_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: financial_documents financial_documents_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_documents financial_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_extraction_logs financial_extraction_logs_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extraction_logs
    ADD CONSTRAINT financial_extraction_logs_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE CASCADE;


--
-- Name: financial_extractions financial_extractions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extractions
    ADD CONSTRAINT financial_extractions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.financial_documents(id) ON DELETE CASCADE;


--
-- Name: financial_extractions financial_extractions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extractions
    ADD CONSTRAINT financial_extractions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_extractions financial_extractions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_extractions
    ADD CONSTRAINT financial_extractions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_history financial_history_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_history
    ADD CONSTRAINT financial_history_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_inputs financial_inputs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_inputs
    ADD CONSTRAINT financial_inputs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: financial_inputs financial_inputs_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_inputs
    ADD CONSTRAINT financial_inputs_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_interviews financial_interviews_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_interviews
    ADD CONSTRAINT financial_interviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_ledger financial_ledger_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_ledger
    ADD CONSTRAINT financial_ledger_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: financial_ledger financial_ledger_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_ledger
    ADD CONSTRAINT financial_ledger_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: generated_documents generated_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_documents
    ADD CONSTRAINT generated_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: generated_documents generated_documents_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_documents
    ADD CONSTRAINT generated_documents_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: interactions interactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: interactions interactions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: lender_qualifications lender_qualifications_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: lender_qualifications lender_qualifications_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: lender_qualifications lender_qualifications_lender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_lender_id_fkey FOREIGN KEY (lender_id) REFERENCES public.deal_professionals(id) ON DELETE CASCADE;


--
-- Name: lender_qualifications lender_qualifications_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_qualifications
    ADD CONSTRAINT lender_qualifications_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: letters_of_intent letters_of_intent_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters_of_intent
    ADD CONSTRAINT letters_of_intent_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: letters_of_intent letters_of_intent_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters_of_intent
    ADD CONSTRAINT letters_of_intent_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE SET NULL;


--
-- Name: letters_of_intent letters_of_intent_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters_of_intent
    ADD CONSTRAINT letters_of_intent_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: letters_of_intent letters_of_intent_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters_of_intent
    ADD CONSTRAINT letters_of_intent_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.deal_offers(id) ON DELETE SET NULL;


--
-- Name: listing_call_clicks listing_call_clicks_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_call_clicks
    ADD CONSTRAINT listing_call_clicks_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_call_clicks listing_call_clicks_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_call_clicks
    ADD CONSTRAINT listing_call_clicks_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_compliance_checks listing_compliance_checks_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_compliance_checks
    ADD CONSTRAINT listing_compliance_checks_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_compliance_checks listing_compliance_checks_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_compliance_checks
    ADD CONSTRAINT listing_compliance_checks_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_documents listing_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_documents
    ADD CONSTRAINT listing_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: listing_documents listing_documents_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_documents
    ADD CONSTRAINT listing_documents_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_documents listing_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_documents
    ADD CONSTRAINT listing_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_expirations listing_expirations_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_expirations
    ADD CONSTRAINT listing_expirations_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_expirations listing_expirations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_expirations
    ADD CONSTRAINT listing_expirations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_financials listing_financials_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_financials
    ADD CONSTRAINT listing_financials_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_intakes listing_intakes_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_intakes listing_intakes_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: listing_intakes listing_intakes_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_intakes listing_intakes_call_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_call_session_id_fkey FOREIGN KEY (call_session_id) REFERENCES public.call_sessions(id) ON DELETE SET NULL;


--
-- Name: listing_intakes listing_intakes_converted_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_converted_listing_id_fkey FOREIGN KEY (converted_listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: listing_intakes listing_intakes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_intakes listing_intakes_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_intakes
    ADD CONSTRAINT listing_intakes_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE SET NULL;


--
-- Name: listing_nda_signatures listing_nda_signatures_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_nda_signatures
    ADD CONSTRAINT listing_nda_signatures_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_recasts listing_recasts_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_recasts
    ADD CONSTRAINT listing_recasts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_recasts listing_recasts_recasted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_recasts
    ADD CONSTRAINT listing_recasts_recasted_by_fkey FOREIGN KEY (recasted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_review_events listing_review_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_review_events
    ADD CONSTRAINT listing_review_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_review_events listing_review_events_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_review_events
    ADD CONSTRAINT listing_review_events_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_review_events listing_review_events_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_review_events
    ADD CONSTRAINT listing_review_events_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_views listing_views_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: listing_views listing_views_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_workflows listing_workflows_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_workflows
    ADD CONSTRAINT listing_workflows_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listing_workflows listing_workflows_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_workflows
    ADD CONSTRAINT listing_workflows_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listings listings_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;


--
-- Name: listings listings_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: listings listings_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listings listings_bizbuysell_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_bizbuysell_uploaded_by_fkey FOREIGN KEY (bizbuysell_uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: listings listings_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: marketing_ai_designs marketing_ai_designs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_ai_designs
    ADD CONSTRAINT marketing_ai_designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_designs marketing_designs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_designs
    ADD CONSTRAINT marketing_designs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketing_products(id) ON DELETE SET NULL;


--
-- Name: marketing_designs marketing_designs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_designs
    ADD CONSTRAINT marketing_designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_orders marketing_orders_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_orders
    ADD CONSTRAINT marketing_orders_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.marketing_designs(id) ON DELETE SET NULL;


--
-- Name: marketing_orders marketing_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_orders
    ADD CONSTRAINT marketing_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketing_products(id) ON DELETE SET NULL;


--
-- Name: marketing_orders marketing_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_orders
    ADD CONSTRAINT marketing_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_product_variants marketing_product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_product_variants
    ADD CONSTRAINT marketing_product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketing_products(id) ON DELETE CASCADE;


--
-- Name: marketplace_connections marketplace_connections_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_connections
    ADD CONSTRAINT marketplace_connections_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: nda_requests nda_requests_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nda_requests
    ADD CONSTRAINT nda_requests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyer_lists(id) ON DELETE CASCADE;


--
-- Name: nda_requests nda_requests_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nda_requests
    ADD CONSTRAINT nda_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: negotiation_drafts negotiation_drafts_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negotiation_drafts
    ADD CONSTRAINT negotiation_drafts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: negotiation_drafts negotiation_drafts_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negotiation_drafts
    ADD CONSTRAINT negotiation_drafts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: negotiation_drafts negotiation_drafts_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negotiation_drafts
    ADD CONSTRAINT negotiation_drafts_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.deal_offers(id) ON DELETE CASCADE;


--
-- Name: newspaper_articles newspaper_articles_edition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_articles
    ADD CONSTRAINT newspaper_articles_edition_id_fkey FOREIGN KEY (edition_id) REFERENCES public.newspaper_editions(id) ON DELETE CASCADE;


--
-- Name: newspaper_delivery_log newspaper_delivery_log_edition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_delivery_log
    ADD CONSTRAINT newspaper_delivery_log_edition_id_fkey FOREIGN KEY (edition_id) REFERENCES public.newspaper_editions(id) ON DELETE CASCADE;


--
-- Name: newspaper_editions newspaper_editions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newspaper_editions
    ADD CONSTRAINT newspaper_editions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: nurture_recipients nurture_recipients_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nurture_recipients
    ADD CONSTRAINT nurture_recipients_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: nurture_recipients nurture_recipients_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nurture_recipients
    ADD CONSTRAINT nurture_recipients_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.nurture_sequences(id) ON DELETE CASCADE;


--
-- Name: nurture_sequences nurture_sequences_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nurture_sequences
    ADD CONSTRAINT nurture_sequences_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: onboarding_tasks onboarding_tasks_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: onboarding_tasks onboarding_tasks_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.onboarding_steps(id) ON DELETE CASCADE;


--
-- Name: password_vault password_vault_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_vault
    ADD CONSTRAINT password_vault_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pending_agent_invites pending_agent_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_agent_invites
    ADD CONSTRAINT pending_agent_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: platform_admins platform_admins_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: post_close_checkins post_close_checkins_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_close_checkins
    ADD CONSTRAINT post_close_checkins_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: post_close_checkins post_close_checkins_converted_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_close_checkins
    ADD CONSTRAINT post_close_checkins_converted_listing_id_fkey FOREIGN KEY (converted_listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: post_close_checkins post_close_checkins_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_close_checkins
    ADD CONSTRAINT post_close_checkins_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: post_close_checkins post_close_checkins_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_close_checkins
    ADD CONSTRAINT post_close_checkins_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: price_watchers price_watchers_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_watchers
    ADD CONSTRAINT price_watchers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: professional_referral_fees professional_referral_fees_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: professional_referral_fees professional_referral_fees_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: professional_referral_fees professional_referral_fees_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: professional_referral_fees professional_referral_fees_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: professional_referral_fees professional_referral_fees_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_referral_fees
    ADD CONSTRAINT professional_referral_fees_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.deal_professionals(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proof_of_funds proof_of_funds_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_funds
    ADD CONSTRAINT proof_of_funds_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: proof_of_funds proof_of_funds_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_funds
    ADD CONSTRAINT proof_of_funds_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: proof_of_funds proof_of_funds_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_funds
    ADD CONSTRAINT proof_of_funds_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: public_listings public_listings_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_listings
    ADD CONSTRAINT public_listings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: public_listings public_listings_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_listings
    ADD CONSTRAINT public_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: purchase_agreements purchase_agreements_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_agreements
    ADD CONSTRAINT purchase_agreements_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: recast_add_backs recast_add_backs_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recast_add_backs
    ADD CONSTRAINT recast_add_backs_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: relationship_edges relationship_edges_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_edges
    ADD CONSTRAINT relationship_edges_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: relationship_edges relationship_edges_from_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_edges
    ADD CONSTRAINT relationship_edges_from_profile_id_fkey FOREIGN KEY (from_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_buyer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_buyer_lead_id_fkey FOREIGN KEY (buyer_lead_id) REFERENCES public.buyer_leads(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE CASCADE;


--
-- Name: saved_searches saved_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sba_qualifications sba_qualifications_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sba_qualifications
    ADD CONSTRAINT sba_qualifications_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: sba_qualifications sba_qualifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sba_qualifications
    ADD CONSTRAINT sba_qualifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: seller_forms seller_forms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_forms
    ADD CONSTRAINT seller_forms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: seller_forms seller_forms_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_forms
    ADD CONSTRAINT seller_forms_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: seller_leads seller_leads_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_leads
    ADD CONSTRAINT seller_leads_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;


--
-- Name: seller_leads seller_leads_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_leads
    ADD CONSTRAINT seller_leads_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.profiles(id);


--
-- Name: seller_leads seller_leads_converted_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_leads
    ADD CONSTRAINT seller_leads_converted_listing_id_fkey FOREIGN KEY (converted_listing_id) REFERENCES public.listings(id);


--
-- Name: seller_listing_orders seller_listing_orders_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_listing_orders
    ADD CONSTRAINT seller_listing_orders_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: seller_listing_orders seller_listing_orders_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_listing_orders
    ADD CONSTRAINT seller_listing_orders_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: seller_listing_orders seller_listing_orders_seller_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_listing_orders
    ADD CONSTRAINT seller_listing_orders_seller_profile_id_fkey FOREIGN KEY (seller_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: seller_readiness seller_readiness_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_readiness
    ADD CONSTRAINT seller_readiness_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: seller_readiness seller_readiness_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_readiness
    ADD CONSTRAINT seller_readiness_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: social_analytics social_analytics_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_analytics
    ADD CONSTRAINT social_analytics_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- Name: sold_comps sold_comps_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_comps
    ADD CONSTRAINT sold_comps_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: syndication_offers syndication_offers_from_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndication_offers
    ADD CONSTRAINT syndication_offers_from_agency_id_fkey FOREIGN KEY (from_agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: syndication_offers syndication_offers_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndication_offers
    ADD CONSTRAINT syndication_offers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: syndication_offers syndication_offers_to_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndication_offers
    ADD CONSTRAINT syndication_offers_to_agency_id_fkey FOREIGN KEY (to_agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: syndication_offers syndication_offers_to_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndication_offers
    ADD CONSTRAINT syndication_offers_to_profile_id_fkey FOREIGN KEY (to_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: team_invites team_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: team_invites team_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: training_certificates training_certificates_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_certificates
    ADD CONSTRAINT training_certificates_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: training_certificates training_certificates_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_certificates
    ADD CONSTRAINT training_certificates_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.training_modules(id) ON DELETE CASCADE;


--
-- Name: training_gamification training_gamification_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_gamification
    ADD CONSTRAINT training_gamification_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: training_lesson_media training_lesson_media_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lesson_media
    ADD CONSTRAINT training_lesson_media_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.training_lessons(id) ON DELETE CASCADE;


--
-- Name: training_lessons training_lessons_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lessons
    ADD CONSTRAINT training_lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.training_modules(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_progress
    ADD CONSTRAINT training_progress_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_progress
    ADD CONSTRAINT training_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.training_lessons(id) ON DELETE CASCADE;


--
-- Name: training_quiz_questions training_quiz_questions_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_quiz_questions
    ADD CONSTRAINT training_quiz_questions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.training_lessons(id) ON DELETE CASCADE;


--
-- Name: training_uploads training_uploads_broker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_uploads
    ADD CONSTRAINT training_uploads_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: training_uploads training_uploads_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_uploads
    ADD CONSTRAINT training_uploads_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.training_modules(id) ON DELETE SET NULL;


--
-- Name: transition_plans transition_plans_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_plans
    ADD CONSTRAINT transition_plans_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: transition_plans transition_plans_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_plans
    ADD CONSTRAINT transition_plans_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: transition_plans transition_plans_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_plans
    ADD CONSTRAINT transition_plans_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: trust_center_settings trust_center_settings_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_center_settings
    ADD CONSTRAINT trust_center_settings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: valuation_estimates valuation_estimates_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_estimates
    ADD CONSTRAINT valuation_estimates_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: valuation_estimates valuation_estimates_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_estimates
    ADD CONSTRAINT valuation_estimates_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: valuation_estimates valuation_estimates_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_estimates
    ADD CONSTRAINT valuation_estimates_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE SET NULL;


--
-- Name: valuation_reports valuation_reports_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_reports
    ADD CONSTRAINT valuation_reports_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: valuation_reports valuation_reports_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_reports
    ADD CONSTRAINT valuation_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: valuation_reports valuation_reports_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_reports
    ADD CONSTRAINT valuation_reports_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: value_growth_plans value_growth_plans_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.value_growth_plans
    ADD CONSTRAINT value_growth_plans_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: value_growth_plans value_growth_plans_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.value_growth_plans
    ADD CONSTRAINT value_growth_plans_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: value_growth_plans value_growth_plans_seller_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.value_growth_plans
    ADD CONSTRAINT value_growth_plans_seller_lead_id_fkey FOREIGN KEY (seller_lead_id) REFERENCES public.seller_leads(id) ON DELETE CASCADE;


--
-- Name: verified_financials verified_financials_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_financials
    ADD CONSTRAINT verified_financials_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: verified_financials verified_financials_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verified_financials
    ADD CONSTRAINT verified_financials_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activities: agents and admin manage" ON public.activities USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: ad_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_slots ad_slots_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_slots_admin_write ON public.ad_slots USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: ad_slots ad_slots_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_slots_public_read ON public.ad_slots FOR SELECT USING (((active = true) AND ((ends_at IS NULL) OR (ends_at >= CURRENT_DATE)) AND (starts_at <= CURRENT_DATE)));


--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_log admin_audit_log_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_audit_log_admin_all ON public.admin_audit_log TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: agencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

--
-- Name: agencies agencies_delete_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_delete_admin_only ON public.agencies FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agencies.id) AND (m.profile_id = auth.uid()) AND (m.role = 'admin'::text)))));


--
-- Name: agencies agencies_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_read ON public.agencies FOR SELECT USING (true);


--
-- Name: agencies agencies_update_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_update_admin_only ON public.agencies FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agencies.id) AND (m.profile_id = auth.uid()) AND (m.role = 'admin'::text)))));


--
-- Name: agency_settings agency settings readable by agency members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agency settings readable by agency members" ON public.agency_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agency_settings.agency_id) AND (m.profile_id = auth.uid())))));


--
-- Name: agency_settings agency settings writable by agency admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agency settings writable by agency admins" ON public.agency_settings USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agency_settings.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agency_settings.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text))))));


--
-- Name: agency_ai_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_ai_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_ai_providers agency_ai_providers_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_ai_providers_agency_access ON public.agency_ai_providers TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: agency_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_members agency_members_insert_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_members_insert_admin_only ON public.agency_members FOR INSERT TO authenticated WITH CHECK ((public.is_admin() AND (EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = agency_members.agency_id) AND (m.profile_id = auth.uid()))))));


--
-- Name: agency_members agency_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_members_read ON public.agency_members FOR SELECT USING (true);


--
-- Name: agency_onboarding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_onboarding ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_onboarding agency_onboarding_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_onboarding_admin ON public.agency_onboarding TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: agency_onboarding agency_onboarding_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_onboarding_member ON public.agency_onboarding FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: agency_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_site_themes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_site_themes ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_site_themes agency_site_themes_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_site_themes_agency_access ON public.agency_site_themes TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: agency_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_usage agency_usage_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_usage_admin_all ON public.agency_usage TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: agent_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_agreements agent_agreements_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_agreements_owner ON public.agent_agreements FOR SELECT USING ((auth.uid() = broker_id));


--
-- Name: agent_agreements agent_agreements_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_agreements_write ON public.agent_agreements FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: agent_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_applications agent_applications_agency_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_applications_agency_read ON public.agent_applications FOR SELECT TO authenticated USING (true);


--
-- Name: agent_applications agent_applications_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_applications_agency_update ON public.agent_applications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: agent_applications agent_applications_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_applications_public_insert ON public.agent_applications FOR INSERT TO anon WITH CHECK (true);


--
-- Name: agent_applications agent_apps_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_apps_insert ON public.agent_applications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: agent_applications agent_apps_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_apps_read ON public.agent_applications FOR SELECT TO authenticated USING (true);


--
-- Name: agent_applications agent_apps_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_apps_update ON public.agent_applications FOR UPDATE TO authenticated USING (true);


--
-- Name: agent_contact_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_contact_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_performance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_performance ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_performance agent_performance: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agent_performance: admin all" ON public.agent_performance USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: agent_performance agent_performance: own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agent_performance: own record" ON public.agent_performance USING ((agent_id = auth.uid()));


--
-- Name: agent_performance_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_performance_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_performance_snapshots agent_performance_snapshots_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_performance_snapshots_agency_access ON public.agent_performance_snapshots TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_agent_config ai config readable by agency members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai config readable by agency members" ON public.ai_agent_config FOR SELECT USING (((agency_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = ai_agent_config.agency_id) AND (m.profile_id = auth.uid()))))));


--
-- Name: ai_agent_config ai config writable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai config writable by admins" ON public.ai_agent_config USING (((agency_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = ai_agent_config.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text))))))) WITH CHECK (true);


--
-- Name: ai_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_actions ai_actions_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_actions_agency_delete ON public.ai_actions FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: ai_actions ai_actions_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_actions_agency_insert ON public.ai_actions FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_actions ai_actions_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_actions_agency_select ON public.ai_actions FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: ai_actions ai_actions_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_actions_agency_update ON public.ai_actions FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_agent_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_approvals ai_approvals_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_approvals_agency_delete ON public.ai_approvals FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: ai_approvals ai_approvals_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_approvals_agency_insert ON public.ai_approvals FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_approvals ai_approvals_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_approvals_agency_select ON public.ai_approvals FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: ai_approvals ai_approvals_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_approvals_agency_update ON public.ai_approvals FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_prompt_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_prompt_versions ai_prompt_versions_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_prompt_versions_agency_delete ON public.ai_prompt_versions FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: ai_prompt_versions ai_prompt_versions_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_prompt_versions_agency_insert ON public.ai_prompt_versions FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: ai_prompt_versions ai_prompt_versions_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_prompt_versions_agency_select ON public.ai_prompt_versions FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: ai_prompt_versions ai_prompt_versions_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_prompt_versions_agency_update ON public.ai_prompt_versions FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: api_keys_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys_registry api_keys_registry_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_registry_admin_read ON public.api_keys_registry FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: api_keys_registry api_keys_registry_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_registry_admin_write ON public.api_keys_registry USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: app_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: app_notifications app_notifications_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_notifications_agency_access ON public.app_notifications TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments appointments_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_agency_delete ON public.appointments FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: appointments appointments_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_agency_insert ON public.appointments FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: appointments appointments_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_agency_select ON public.appointments FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: appointments appointments_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_agency_update ON public.appointments FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: document_audit_logs audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_read ON public.document_audit_logs FOR SELECT TO authenticated USING (true);


--
-- Name: auto_generation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_generation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: bbs_syncs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bbs_syncs ENABLE ROW LEVEL SECURITY;

--
-- Name: broker_financial_files bff: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bff: admin all" ON public.broker_financial_files USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: broker_financial_files bff: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bff: agent owns via listing" ON public.broker_financial_files USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = broker_financial_files.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: bli_versions bli: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bli: admin all" ON public.bli_versions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: bli_versions bli: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bli: agent owns via listing" ON public.bli_versions USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = bli_versions.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: bli_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bli_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_nqa_responses bnqa_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bnqa_agency_insert ON public.buyer_nqa_responses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = buyer_nqa_responses.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: buyer_nqa_responses bnqa_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bnqa_agency_select ON public.buyer_nqa_responses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = buyer_nqa_responses.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: buyer_bookmarked_listings bookmarks_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookmarks_agency_access ON public.buyer_bookmarked_listings TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_bookmarked_listings bookmarks_buyer_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookmarks_buyer_access ON public.buyer_bookmarked_listings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.buyer_search_profiles p
  WHERE ((p.id = buyer_bookmarked_listings.buyer_profile_id) AND (p.profile_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.buyer_search_profiles p
  WHERE ((p.id = buyer_bookmarked_listings.buyer_profile_id) AND (p.profile_id = auth.uid())))));


--
-- Name: bov_versions bov: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bov: admin all" ON public.bov_versions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: bov_versions bov: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bov: agent owns via listing" ON public.bov_versions USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = bov_versions.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: bov_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bov_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: bov_versions bov_versions_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bov_versions_auth_delete ON public.bov_versions FOR DELETE TO authenticated USING (true);


--
-- Name: bov_versions bov_versions_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bov_versions_auth_insert ON public.bov_versions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: bov_versions bov_versions_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bov_versions_auth_select ON public.bov_versions FOR SELECT TO authenticated USING (true);


--
-- Name: bov_versions bov_versions_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bov_versions_auth_update ON public.bov_versions FOR UPDATE TO authenticated USING (true);


--
-- Name: buyer_pipeline_events bpe_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpe_agency_delete ON public.buyer_pipeline_events FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = buyer_pipeline_events.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: buyer_pipeline_events bpe_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpe_agency_insert ON public.buyer_pipeline_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = buyer_pipeline_events.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: buyer_pipeline_events bpe_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpe_agency_select ON public.buyer_pipeline_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = buyer_pipeline_events.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: broker_financial_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broker_financial_files ENABLE ROW LEVEL SECURITY;

--
-- Name: broker_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broker_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: broker_photos broker_photos_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broker_photos_auth_read ON public.broker_photos FOR SELECT TO authenticated USING (true);


--
-- Name: broker_photos broker_photos_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broker_photos_auth_write ON public.broker_photos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: broker_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: broker_profiles broker_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broker_profiles_read ON public.broker_profiles FOR SELECT USING (true);


--
-- Name: buyer_subscriptions buyer manages own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buyer manages own subscription" ON public.buyer_subscriptions USING ((auth.uid() = profile_id)) WITH CHECK ((auth.uid() = profile_id));


--
-- Name: buyer_subscriptions buyer sees own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buyer sees own subscription" ON public.buyer_subscriptions FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: buyer_bookmarked_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_bookmarked_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_engagement_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_engagement_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_engagement_scores buyer_engagement_scores_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_engagement_scores_agency_access ON public.buyer_engagement_scores TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_leads buyer_leads_agency_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_leads_agency_manage ON public.buyer_leads TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_leads buyer_leads_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_leads_public_insert ON public.buyer_leads FOR INSERT TO anon WITH CHECK (public.buyer_lead_insert_allowed(agency_id, listing_id));


--
-- Name: buyer_leads buyer_leads_public_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_leads_public_insert_auth ON public.buyer_leads FOR INSERT TO authenticated WITH CHECK (public.buyer_lead_insert_allowed(agency_id, listing_id));


--
-- Name: buyer_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_lists buyer_lists: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buyer_lists: admin all" ON public.buyer_lists USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: buyer_lists buyer_lists: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buyer_lists: agent owns via listing" ON public.buyer_lists USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = buyer_lists.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: buyer_lists buyer_lists_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_lists_auth_delete ON public.buyer_lists FOR DELETE TO authenticated USING (true);


--
-- Name: buyer_lists buyer_lists_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_lists_auth_insert ON public.buyer_lists FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: buyer_lists buyer_lists_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_lists_auth_select ON public.buyer_lists FOR SELECT TO authenticated USING (true);


--
-- Name: buyer_lists buyer_lists_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_lists_auth_update ON public.buyer_lists FOR UPDATE TO authenticated USING (true);


--
-- Name: buyer_match_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_match_events ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_match_events buyer_match_events_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_match_events_agency_access ON public.buyer_match_events TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_match_events buyer_match_events_buyer_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_match_events_buyer_access ON public.buyer_match_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.buyer_search_profiles p
  WHERE ((p.id = buyer_match_events.buyer_profile_id) AND (p.profile_id = auth.uid())))));


--
-- Name: buyer_nqa_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_nqa_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_pipeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_pipeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_search_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_search_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_search_profiles buyer_search_profiles_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_search_profiles_agency_access ON public.buyer_search_profiles TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_search_profiles buyer_search_profiles_owner_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyer_search_profiles_owner_access ON public.buyer_search_profiles TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));


--
-- Name: buyer_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_watchlist_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_watchlist_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_connections calendar_connections_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_connections_agency_delete ON public.calendar_connections FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: calendar_connections calendar_connections_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_connections_agency_insert ON public.calendar_connections FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: calendar_connections calendar_connections_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_connections_agency_select ON public.calendar_connections FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: calendar_connections calendar_connections_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_connections_agency_update ON public.calendar_connections FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_call_clicks call clicks agency read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "call clicks agency read" ON public.listing_call_clicks FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.profile_id = auth.uid()) AND (m.agency_id = listing_call_clicks.agency_id)))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: listing_call_clicks call clicks anon insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "call clicks anon insert" ON public.listing_call_clicks FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: call_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: call_sessions call_sessions_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_sessions_agency_delete ON public.call_sessions FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: call_sessions call_sessions_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_sessions_agency_insert ON public.call_sessions FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: call_sessions call_sessions_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_sessions_agency_select ON public.call_sessions FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: call_sessions call_sessions_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_sessions_agency_update ON public.call_sessions FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: call_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: call_summaries call_summaries_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_summaries_agency_access ON public.call_summaries TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: call_transcripts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

--
-- Name: call_transcripts call_transcripts_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_transcripts_agency_delete ON public.call_transcripts FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: call_transcripts call_transcripts_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_transcripts_agency_insert ON public.call_transcripts FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: call_transcripts call_transcripts_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_transcripts_agency_select ON public.call_transcripts FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: call_transcripts call_transcripts_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_transcripts_agency_update ON public.call_transcripts FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: cim_versions cim: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cim: admin all" ON public.cim_versions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: cim_versions cim: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cim: agent owns via listing" ON public.cim_versions USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = cim_versions.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: cim_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cim_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: cim_versions cim_versions_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cim_versions_auth_delete ON public.cim_versions FOR DELETE TO authenticated USING (true);


--
-- Name: cim_versions cim_versions_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cim_versions_auth_insert ON public.cim_versions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: cim_versions cim_versions_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cim_versions_auth_select ON public.cim_versions FOR SELECT TO authenticated USING (true);


--
-- Name: cim_versions cim_versions_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cim_versions_auth_update ON public.cim_versions FOR UPDATE TO authenticated USING (true);


--
-- Name: client_portal_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_access client_portal_access_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_delete ON public.client_portal_access FOR DELETE TO authenticated USING (true);


--
-- Name: client_portal_access client_portal_access_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_insert ON public.client_portal_access FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: client_portal_access client_portal_access_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_select ON public.client_portal_access FOR SELECT TO authenticated USING (true);


--
-- Name: client_portal_access client_portal_access_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_update ON public.client_portal_access FOR UPDATE TO authenticated USING (true);


--
-- Name: deal_closing_details closing: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "closing: admin all" ON public.deal_closing_details USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: deal_closing_details closing: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "closing: agent owns via listing" ON public.deal_closing_details USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = deal_closing_details.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: deal_closing_milestones closing_milestones_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY closing_milestones_agency_access ON public.deal_closing_milestones TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: commission_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_records commission_records_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commission_records_agency_access ON public.commission_records TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_commissions commissions: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commissions: admin all" ON public.deal_commissions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: deal_commissions commissions: agent owns via listing or split; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commissions: agent owns via listing or split" ON public.deal_commissions USING (((agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = deal_commissions.listing_id) AND (l.agent_id = auth.uid()))))));


--
-- Name: communications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

--
-- Name: communications communications_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communications_agency_access ON public.communications TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: compliance_jurisdictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_jurisdictions ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_jurisdictions compliance_jurisdictions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_jurisdictions_read ON public.compliance_jurisdictions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: compliance_policy_packs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_policy_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_policy_packs compliance_policy_packs_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_policy_packs_authenticated_read ON public.compliance_policy_packs FOR SELECT TO authenticated USING ((status = 'approved'::text));


--
-- Name: agent_contact_requests contact_requests: agents and admin read/manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contact_requests: agents and admin read/manage" ON public.agent_contact_requests USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: agent_contact_requests contact_requests: public can create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contact_requests: public can create" ON public.agent_contact_requests FOR INSERT WITH CHECK (true);


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contacts: agents and admin manage" ON public.contacts USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: contractor_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contractor_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: contractor_payments contractor_payments_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contractor_payments_admin_all ON public.contractor_payments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: contractors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

--
-- Name: contractors contractors_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contractors_admin_all ON public.contractors TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: data_room_access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_activities data_room_activities_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_activities_agency_access ON public.data_room_activities TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_activities.data_room_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_activities.data_room_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_ai_queries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_ai_queries ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_ai_queries data_room_ai_queries_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_ai_queries_agency_access ON public.data_room_ai_queries TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: data_room_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_buyers data_room_buyers_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_buyers_agency_access ON public.data_room_buyers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_buyers.data_room_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_buyers.data_room_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_comments data_room_comments_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_comments_agency_access ON public.data_room_comments TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_comments.file_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_comments.file_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_download_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_download_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_download_logs data_room_download_logs_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_download_logs_agency_access ON public.data_room_download_logs TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_download_logs.file_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_download_logs.file_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_files ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_files data_room_files_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_files_agency_access ON public.data_room_files TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_files.data_room_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_files.data_room_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_folders data_room_folders_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_folders_agency_access ON public.data_room_folders TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_folders.data_room_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_folders.data_room_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_qa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_qa ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_qa data_room_qa_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_qa_agency_access ON public.data_room_qa TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: data_room_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_shares data_room_shares_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_shares_agency_access ON public.data_room_shares TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_shares.data_room_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.data_rooms room
  WHERE ((room.id = data_room_shares.data_room_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_room_trash; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_trash ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_trash data_room_trash_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_trash_agency_access ON public.data_room_trash TO authenticated USING (public.is_broker_or_admin()) WITH CHECK (public.is_broker_or_admin());


--
-- Name: data_room_view_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_room_view_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_view_logs data_room_view_logs_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_room_view_logs_agency_access ON public.data_room_view_logs TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_view_logs.file_id) AND public.is_agency_member(room.agency_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.data_room_files f
     JOIN public.data_rooms room ON ((room.id = f.data_room_id)))
  WHERE ((f.id = data_room_view_logs.file_id) AND public.is_agency_member(room.agency_id)))));


--
-- Name: data_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: data_rooms data_rooms_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY data_rooms_agency_access ON public.data_rooms TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: due_diligence_items dd_items: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dd_items: agents and admin manage" ON public.due_diligence_items USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: deal_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_agreements deal_agreements: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deal_agreements: admin all" ON public.deal_agreements USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: deal_agreements deal_agreements: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deal_agreements: agent owns via listing" ON public.deal_agreements USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = deal_agreements.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: deal_agreements deal_agreements_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_agreements_auth_delete ON public.deal_agreements FOR DELETE TO authenticated USING (true);


--
-- Name: deal_agreements deal_agreements_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_agreements_auth_insert ON public.deal_agreements FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: deal_agreements deal_agreements_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_agreements_auth_select ON public.deal_agreements FOR SELECT TO authenticated USING (true);


--
-- Name: deal_agreements deal_agreements_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_agreements_auth_update ON public.deal_agreements FOR UPDATE TO authenticated USING (true);


--
-- Name: deal_closing_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_closing_details ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_closing_details deal_closing_details_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_closing_details_auth_delete ON public.deal_closing_details FOR DELETE TO authenticated USING (true);


--
-- Name: deal_closing_details deal_closing_details_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_closing_details_auth_insert ON public.deal_closing_details FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: deal_closing_details deal_closing_details_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_closing_details_auth_select ON public.deal_closing_details FOR SELECT TO authenticated USING (true);


--
-- Name: deal_closing_details deal_closing_details_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_closing_details_auth_update ON public.deal_closing_details FOR UPDATE TO authenticated USING (true);


--
-- Name: deal_closing_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_closing_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_contacts deal_contacts: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deal_contacts: agents and admin manage" ON public.deal_contacts USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: deal_digests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_digests deal_digests_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_digests_agency_access ON public.deal_digests TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_documents deal_docs: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deal_docs: agents and admin manage" ON public.deal_documents USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: deal_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_documents deal_documents_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_documents_auth_delete ON public.deal_documents FOR DELETE TO authenticated USING (true);


--
-- Name: deal_documents deal_documents_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_documents_auth_insert ON public.deal_documents FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: deal_documents deal_documents_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_documents_auth_select ON public.deal_documents FOR SELECT TO authenticated USING (true);


--
-- Name: deal_documents deal_documents_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_documents_auth_update ON public.deal_documents FOR UPDATE TO authenticated USING (true);


--
-- Name: deal_escrow_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_escrow_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_fact_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_fact_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_fact_evidence deal_fact_evidence_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_fact_evidence_agency_access ON public.deal_fact_evidence TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_notify_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_notify_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_notify_subscriptions deal_notify_subscriptions_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_notify_subscriptions_agency_access ON public.deal_notify_subscriptions TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_offers deal_offers_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_offers_agency_access ON public.deal_offers TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_passports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_passports ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_passports deal_passports_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_passports_agency_access ON public.deal_passports TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_professionals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_professionals ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_professionals deal_professionals_agency_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_professionals_agency_write ON public.deal_professionals TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_professionals deal_professionals_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_professionals_public_read ON public.deal_professionals FOR SELECT USING (((is_active = true) AND (advertised = true)));


--
-- Name: deal_success_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_success_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_twin_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_twin_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_twin_snapshots deal_twin_snapshots_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_twin_snapshots_agency_access ON public.deal_twin_snapshots TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_twins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_twins ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_twins deal_twins_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_twins_agency_delete ON public.deal_twins FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: deal_twins deal_twins_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_twins_agency_insert ON public.deal_twins FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_twins deal_twins_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_twins_agency_select ON public.deal_twins FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: deal_twins deal_twins_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deal_twins_agency_update ON public.deal_twins FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_agency_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_agency_manage ON public.deals TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: generated_documents docs: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docs: admin all" ON public.generated_documents USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: listing_documents docs: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docs: admin all" ON public.listing_documents USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: generated_documents docs: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docs: agent owns via listing" ON public.generated_documents USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = generated_documents.listing_id) AND (l.agent_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = generated_documents.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: listing_documents docs: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docs: agent owns via listing" ON public.listing_documents USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_documents.listing_id) AND (l.agent_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_documents.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: listing_documents docs: public can submit nda; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docs: public can submit nda" ON public.listing_documents FOR INSERT WITH CHECK (((category = 'nda'::text) AND (party_type = 'buyer'::text) AND (status = 'signed'::text)));


--
-- Name: document_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: document_audit_logs document_audit_logs_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_audit_logs_auth_read ON public.document_audit_logs FOR SELECT TO authenticated USING (true);


--
-- Name: document_audit_logs document_audit_logs_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_audit_logs_auth_write ON public.document_audit_logs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: document_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: document_signatures document_signatures_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_signatures_auth_read ON public.document_signatures FOR SELECT TO authenticated USING (true);


--
-- Name: document_signatures document_signatures_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_signatures_auth_write ON public.document_signatures TO authenticated USING (true) WITH CHECK (true);


--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates document_templates_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_admin_write ON public.document_templates TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: document_templates document_templates_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_auth_read ON public.document_templates FOR SELECT TO authenticated USING (true);


--
-- Name: document_templates document_templates_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_auth_write ON public.document_templates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: document_templates document_templates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_read ON public.document_templates FOR SELECT TO authenticated USING (true);


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_auth_insert ON public.documents FOR INSERT TO authenticated WITH CHECK ((auth.uid() = created_by));


--
-- Name: documents documents_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_auth_read ON public.documents FOR SELECT TO authenticated USING (true);


--
-- Name: documents documents_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_auth_write ON public.documents TO authenticated USING (true) WITH CHECK (true);


--
-- Name: documents documents_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_owner_delete ON public.documents FOR DELETE TO authenticated USING ((auth.uid() = created_by));


--
-- Name: documents documents_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_owner_update ON public.documents FOR UPDATE TO authenticated USING ((auth.uid() = created_by)) WITH CHECK ((auth.uid() = created_by));


--
-- Name: due_diligence_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.due_diligence_items ENABLE ROW LEVEL SECURITY;

--
-- Name: due_diligence_items due_diligence_items_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY due_diligence_items_auth_delete ON public.due_diligence_items FOR DELETE TO authenticated USING (true);


--
-- Name: due_diligence_items due_diligence_items_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY due_diligence_items_auth_insert ON public.due_diligence_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: due_diligence_items due_diligence_items_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY due_diligence_items_auth_select ON public.due_diligence_items FOR SELECT TO authenticated USING (true);


--
-- Name: due_diligence_items due_diligence_items_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY due_diligence_items_auth_update ON public.due_diligence_items FOR UPDATE TO authenticated USING (true);


--
-- Name: email_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: email_emails email_emails_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_emails_owner_select ON public.email_emails FOR SELECT USING (true);


--
-- Name: email_emails email_emails_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_emails_service_all ON public.email_emails USING (true) WITH CHECK (true);


--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_agency_access ON public.email_templates TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: deal_escrow_accounts escrow_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrow_agency_access ON public.deal_escrow_accounts TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: exchange_opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_opportunities exchange_opportunities_origin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_opportunities_origin_access ON public.exchange_opportunities TO authenticated USING (public.is_agency_member(origin_agency_id)) WITH CHECK (public.is_agency_member(origin_agency_id));


--
-- Name: exchange_partnerships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_partnerships ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_partnerships exchange_partnerships_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_partnerships_agency_access ON public.exchange_partnerships TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_admin_all ON public.expenses TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: expenses expenses_agency_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_agency_read ON public.expenses FOR SELECT TO authenticated USING (((agency_id IS NOT NULL) AND public.is_agency_member(agency_id)));


--
-- Name: financial_extractions extractions agency access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "extractions agency access" ON public.financial_extractions USING (((EXISTS ( SELECT 1
   FROM ((public.financial_documents fd
     JOIN public.listings l ON ((l.id = fd.listing_id)))
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((fd.id = financial_extractions.document_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ((public.financial_documents fd
     JOIN public.listings l ON ((l.id = fd.listing_id)))
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((fd.id = financial_extractions.document_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: financial_documents fd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_insert ON public.financial_documents FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: financial_documents fd_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_select ON public.financial_documents FOR SELECT TO authenticated USING (true);


--
-- Name: featured_slots featured slots readable by agency members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "featured slots readable by agency members" ON public.featured_slots FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = featured_slots.agency_id) AND (m.profile_id = auth.uid())))));


--
-- Name: featured_slots featured slots writable by agency admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "featured slots writable by agency admins" ON public.featured_slots USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = featured_slots.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = featured_slots.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text))))));


--
-- Name: featured_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.featured_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_extraction_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_extraction_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_history ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_history financial_history_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_history_agency_access ON public.financial_history TO authenticated USING (public.is_agency_member(( SELECT l.agency_id
   FROM public.listings l
  WHERE (l.id = financial_history.listing_id)))) WITH CHECK (public.is_agency_member(( SELECT l.agency_id
   FROM public.listings l
  WHERE (l.id = financial_history.listing_id))));


--
-- Name: financial_inputs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_inputs ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_interviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_interviews ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_inputs financials: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "financials: admin all" ON public.financial_inputs USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: financial_inputs financials: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "financials: agent owns via listing" ON public.financial_inputs USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = financial_inputs.listing_id) AND (l.agent_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = financial_inputs.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: generated_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: hiring_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hiring_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: hiring_packages hiring_packages_agency_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hiring_packages_agency_read ON public.hiring_packages FOR SELECT TO authenticated USING (true);


--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions interactions: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interactions: agents and admin manage" ON public.interactions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: financial_interviews interviews agency access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interviews agency access" ON public.financial_interviews USING (((EXISTS ( SELECT 1
   FROM (public.listings l
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((l.id = financial_interviews.listing_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.listings l
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((l.id = financial_interviews.listing_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: invite_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_tokens invite_tokens_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_tokens_insert_all ON public.invite_tokens FOR INSERT WITH CHECK (true);


--
-- Name: invite_tokens invite_tokens_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_tokens_select_all ON public.invite_tokens FOR SELECT USING (true);


--
-- Name: invite_tokens invite_tokens_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_tokens_update_all ON public.invite_tokens FOR UPDATE USING (true);


--
-- Name: pending_agent_invites invites: admins only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invites: admins only" ON public.pending_agent_invites USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_documents ldoc_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ldoc_delete ON public.listing_documents FOR DELETE TO authenticated USING (true);


--
-- Name: listing_documents ldoc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ldoc_insert ON public.listing_documents FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: listing_documents ldoc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ldoc_select ON public.listing_documents FOR SELECT TO authenticated USING (true);


--
-- Name: listing_documents ldoc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ldoc_update ON public.listing_documents FOR UPDATE TO authenticated USING (true);


--
-- Name: lead_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activities lead_activities: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lead_activities: agents and admin manage" ON public.lead_activities USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: lead_activities lead_activities_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_auth_delete ON public.lead_activities FOR DELETE TO authenticated USING (true);


--
-- Name: lead_activities lead_activities_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_auth_insert ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: lead_activities lead_activities_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_auth_select ON public.lead_activities FOR SELECT TO authenticated USING (true);


--
-- Name: lead_activities lead_activities_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_auth_update ON public.lead_activities FOR UPDATE TO authenticated USING (true);


--
-- Name: financial_ledger ledger agency access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ledger agency access" ON public.financial_ledger USING (((EXISTS ( SELECT 1
   FROM (public.listings l
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((l.id = financial_ledger.listing_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.listings l
     JOIN public.agency_members m ON ((m.agency_id = l.agency_id)))
  WHERE ((l.id = financial_ledger.listing_id) AND (m.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: legal_vault; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legal_vault ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_vault legal_vault_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_vault_admin_read ON public.legal_vault FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: legal_vault legal_vault_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_vault_admin_write ON public.legal_vault USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: lender_qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lender_qualifications ENABLE ROW LEVEL SECURITY;

--
-- Name: letters_of_intent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.letters_of_intent ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_call_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_call_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_compliance_checks listing_compliance_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_compliance_agency_access ON public.listing_compliance_checks TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_compliance_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_compliance_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_documents listing_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_documents_delete ON public.listing_documents FOR DELETE TO authenticated USING (true);


--
-- Name: listing_documents listing_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_documents_insert ON public.listing_documents FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: listing_documents listing_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_documents_select ON public.listing_documents FOR SELECT TO authenticated USING (true);


--
-- Name: listing_documents listing_documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_documents_update ON public.listing_documents FOR UPDATE TO authenticated USING (true);


--
-- Name: listing_expirations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_expirations ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_expirations listing_expirations_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_expirations_agency_access ON public.listing_expirations TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_financials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_financials ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_financials listing_financials: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "listing_financials: admin all" ON public.listing_financials USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: listing_financials listing_financials: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "listing_financials: agent owns via listing" ON public.listing_financials USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_financials.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: listing_intakes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_intakes ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_intakes listing_intakes_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_intakes_agency_delete ON public.listing_intakes FOR DELETE TO authenticated USING (public.is_agency_admin(agency_id));


--
-- Name: listing_intakes listing_intakes_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_intakes_agency_insert ON public.listing_intakes FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_intakes listing_intakes_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_intakes_agency_select ON public.listing_intakes FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: listing_intakes listing_intakes_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_intakes_agency_update ON public.listing_intakes FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_nda_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_nda_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_recasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_recasts ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_review_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_review_events ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_review_events listing_review_events_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_review_events_agency_access ON public.listing_review_events TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: listing_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_views listing_views_agency_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_views_agency_read ON public.listing_views FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: listing_views listing_views_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_views_public_insert ON public.listing_views FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: listing_workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: listings listings_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_agency_delete ON public.listings FOR DELETE TO authenticated USING (((agent_id = auth.uid()) OR public.is_agency_admin(agency_id)));


--
-- Name: listings listings_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_agency_insert ON public.listings FOR INSERT TO authenticated WITH CHECK ((public.is_agency_member(agency_id) AND ((agent_id = auth.uid()) OR public.is_agency_admin(agency_id))));


--
-- Name: listings listings_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_agency_select ON public.listings FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: listings listings_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_agency_update ON public.listings FOR UPDATE TO authenticated USING ((public.is_agency_member(agency_id) AND ((agent_id = auth.uid()) OR public.is_agency_admin(agency_id)))) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: locations locations_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_select_all ON public.locations FOR SELECT USING (true);


--
-- Name: letters_of_intent loi_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loi_agency_access ON public.letters_of_intent TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: lender_qualifications lq_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_insert ON public.lender_qualifications FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: lender_qualifications lq_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_select ON public.lender_qualifications FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: lender_qualifications lq_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_update ON public.lender_qualifications FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: market_multiples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_multiples ENABLE ROW LEVEL SECURITY;

--
-- Name: market_multiples market_multiples_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY market_multiples_read ON public.market_multiples FOR SELECT TO authenticated USING (true);


--
-- Name: marketing_ai_designs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_ai_designs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_ai_designs marketing_ai_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_ai_owner ON public.marketing_ai_designs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: marketing_designs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_designs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_designs marketing_designs_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_designs_auth_read ON public.marketing_designs FOR SELECT TO authenticated USING (true);


--
-- Name: marketing_designs marketing_designs_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_designs_auth_write ON public.marketing_designs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: marketing_designs marketing_designs_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_designs_owner ON public.marketing_designs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: marketing_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_orders marketing_orders_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_orders_auth_read ON public.marketing_orders FOR SELECT TO authenticated USING (true);


--
-- Name: marketing_orders marketing_orders_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_orders_auth_write ON public.marketing_orders TO authenticated USING (true) WITH CHECK (true);


--
-- Name: marketing_orders marketing_orders_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_orders_owner ON public.marketing_orders USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: marketing_product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_products ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_products marketing_products_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_products_auth_read ON public.marketing_products FOR SELECT TO authenticated USING (true);


--
-- Name: marketing_products marketing_products_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_products_auth_write ON public.marketing_products TO authenticated USING (true) WITH CHECK (true);


--
-- Name: marketing_products marketing_products_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_products_read ON public.marketing_products FOR SELECT USING (true);


--
-- Name: marketing_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_templates marketing_templates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_templates_read ON public.marketing_templates FOR SELECT USING (true);


--
-- Name: marketing_product_variants marketing_variants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_variants_read ON public.marketing_product_variants FOR SELECT USING (true);


--
-- Name: marketplace_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_connections marketplace_connections_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_connections_agency_access ON public.marketplace_connections TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: nda_requests nda: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nda: admin all" ON public.nda_requests USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: nda_requests nda: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nda: agent owns via listing" ON public.nda_requests USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = nda_requests.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: nda_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nda_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: data_room_access_requests nda_requests_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nda_requests_agency_access ON public.data_room_access_requests TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: negotiation_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negotiation_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: negotiation_drafts negotiation_drafts_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY negotiation_drafts_agency_access ON public.negotiation_drafts TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: newspaper_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newspaper_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: newspaper_articles newspaper_articles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_articles_delete ON public.newspaper_articles FOR DELETE TO authenticated USING (true);


--
-- Name: newspaper_articles newspaper_articles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_articles_insert ON public.newspaper_articles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: newspaper_articles newspaper_articles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_articles_select ON public.newspaper_articles FOR SELECT TO authenticated USING (true);


--
-- Name: newspaper_articles newspaper_articles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_articles_update ON public.newspaper_articles FOR UPDATE TO authenticated USING (true);


--
-- Name: newspaper_delivery_log newspaper_delivery_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_delivery_insert ON public.newspaper_delivery_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: newspaper_delivery_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newspaper_delivery_log ENABLE ROW LEVEL SECURITY;

--
-- Name: newspaper_delivery_log newspaper_delivery_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_delivery_select ON public.newspaper_delivery_log FOR SELECT TO authenticated USING (true);


--
-- Name: newspaper_editions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newspaper_editions ENABLE ROW LEVEL SECURITY;

--
-- Name: newspaper_editions newspaper_editions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_editions_delete ON public.newspaper_editions FOR DELETE TO authenticated USING (true);


--
-- Name: newspaper_editions newspaper_editions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_editions_insert ON public.newspaper_editions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: newspaper_editions newspaper_editions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_editions_select ON public.newspaper_editions FOR SELECT TO authenticated USING (true);


--
-- Name: newspaper_editions newspaper_editions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_editions_update ON public.newspaper_editions FOR UPDATE TO authenticated USING (true);


--
-- Name: newspaper_subscriptions newspaper_subs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_subs_delete ON public.newspaper_subscriptions FOR DELETE TO authenticated USING (true);


--
-- Name: newspaper_subscriptions newspaper_subs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_subs_insert ON public.newspaper_subscriptions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: newspaper_subscriptions newspaper_subs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_subs_select ON public.newspaper_subscriptions FOR SELECT TO authenticated USING (true);


--
-- Name: newspaper_subscriptions newspaper_subs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newspaper_subs_update ON public.newspaper_subscriptions FOR UPDATE TO authenticated USING (true);


--
-- Name: newspaper_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newspaper_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications: system insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: system insert" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications notifications: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: users read own" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: nurture_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nurture_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: nurture_recipients nurture_recipients_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nurture_recipients_agency_access ON public.nurture_recipients TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: nurture_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nurture_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: nurture_sequences nurture_sequences_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nurture_sequences_agency_access ON public.nurture_sequences TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: onboarding_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_agreements pa: agents and admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pa: agents and admin manage" ON public.purchase_agreements USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['agent'::text, 'admin'::text]))))));


--
-- Name: password_vault; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_vault ENABLE ROW LEVEL SECURITY;

--
-- Name: password_vault password_vault owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "password_vault owner delete" ON public.password_vault FOR DELETE USING ((auth.uid() = profile_id));


--
-- Name: password_vault password_vault owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "password_vault owner insert" ON public.password_vault FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: password_vault password_vault owner select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "password_vault owner select" ON public.password_vault FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: password_vault password_vault owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "password_vault owner update" ON public.password_vault FOR UPDATE USING ((auth.uid() = profile_id));


--
-- Name: post_close_checkins pcc_agency_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pcc_agency_insert ON public.post_close_checkins FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = post_close_checkins.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: post_close_checkins pcc_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pcc_agency_select ON public.post_close_checkins FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = post_close_checkins.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: post_close_checkins pcc_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pcc_agency_update ON public.post_close_checkins FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agency_members am
  WHERE ((am.agency_id = post_close_checkins.agency_id) AND (am.profile_id = auth.uid())))));


--
-- Name: pending_agent_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_agent_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings platform settings readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform settings readable" ON public.platform_settings FOR SELECT USING (true);


--
-- Name: platform_settings platform settings writable by service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform settings writable by service" ON public.platform_settings USING (true) WITH CHECK (true);


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins are readable by service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform_admins are readable by service" ON public.platform_admins FOR SELECT USING (true);


--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_messages portal_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_messages_insert ON public.portal_messages FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: portal_messages portal_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_messages_select ON public.portal_messages FOR SELECT TO authenticated USING (true);


--
-- Name: post_close_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_close_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: price_watchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_watchers ENABLE ROW LEVEL SECURITY;

--
-- Name: price_watchers price_watchers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_watchers_delete ON public.price_watchers FOR DELETE USING (true);


--
-- Name: price_watchers price_watchers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_watchers_insert ON public.price_watchers FOR INSERT WITH CHECK (true);


--
-- Name: price_watchers price_watchers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_watchers_select ON public.price_watchers FOR SELECT USING (true);


--
-- Name: professional_referral_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_referral_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_referral_fees professional_referral_fees_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY professional_referral_fees_read ON public.professional_referral_fees FOR SELECT TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: professional_referral_fees professional_referral_fees_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY professional_referral_fees_update ON public.professional_referral_fees FOR UPDATE TO authenticated USING (public.is_agency_member(agency_id));


--
-- Name: professional_referral_fees professional_referral_fees_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY professional_referral_fees_write ON public.professional_referral_fees FOR INSERT TO authenticated WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: profile_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_images ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_images profile_images_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_images_auth_read ON public.profile_images FOR SELECT TO authenticated USING (true);


--
-- Name: profile_images profile_images_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_images_auth_write ON public.profile_images TO authenticated USING (true) WITH CHECK (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: insert own" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: update own" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles profiles_same_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_same_agency_select ON public.profiles FOR SELECT TO authenticated USING (public.shares_agency_with(id));


--
-- Name: proof_of_funds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proof_of_funds ENABLE ROW LEVEL SECURITY;

--
-- Name: proof_of_funds proof_of_funds_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proof_of_funds_agency_access ON public.proof_of_funds TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: public_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: public_listings public_listings_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_listings_auth_delete ON public.public_listings FOR DELETE TO authenticated USING (true);


--
-- Name: public_listings public_listings_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_listings_auth_insert ON public.public_listings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: public_listings public_listings_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_listings_auth_read ON public.public_listings FOR SELECT TO authenticated USING (true);


--
-- Name: public_listings public_listings_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_listings_auth_update ON public.public_listings FOR UPDATE TO authenticated USING (true);


--
-- Name: purchase_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: recast_add_backs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recast_add_backs ENABLE ROW LEVEL SECURITY;

--
-- Name: recast_add_backs recast_add_backs_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recast_add_backs_agency_access ON public.recast_add_backs TO authenticated USING (public.is_agency_member(( SELECT l.agency_id
   FROM public.listings l
  WHERE (l.id = recast_add_backs.listing_id)))) WITH CHECK (public.is_agency_member(( SELECT l.agency_id
   FROM public.listings l
  WHERE (l.id = recast_add_backs.listing_id))));


--
-- Name: recast_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recast_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_recasts recasts: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recasts: admin all" ON public.listing_recasts USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: listing_recasts recasts: agent owns via listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recasts: agent owns via listing" ON public.listing_recasts USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_recasts.listing_id) AND (l.agent_id = auth.uid())))));


--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals referrals_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referrals_agency_access ON public.referrals TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: relationship_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationship_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_edges relationship_edges_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationship_edges_agency_access ON public.relationship_edges TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminders_agency_access ON public.reminders TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_searches saved_searches_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_searches_own ON public.saved_searches USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: sba_qualifications sba_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_delete ON public.sba_qualifications FOR DELETE TO authenticated USING (true);


--
-- Name: sba_qualifications sba_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_insert ON public.sba_qualifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sba_qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sba_qualifications ENABLE ROW LEVEL SECURITY;

--
-- Name: sba_qualifications sba_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_select ON public.sba_qualifications FOR SELECT TO authenticated USING (true);


--
-- Name: sba_qualifications sba_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_update ON public.sba_qualifications FOR UPDATE TO authenticated USING (true);


--
-- Name: search_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_log ENABLE ROW LEVEL SECURITY;

--
-- Name: search_log search_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_log_admin_read ON public.search_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: search_log search_log_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_log_auth_insert ON public.search_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: seller_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_forms seller_forms_auth_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_forms_auth_delete ON public.seller_forms FOR DELETE TO authenticated USING (true);


--
-- Name: seller_forms seller_forms_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_forms_auth_insert ON public.seller_forms FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: seller_forms seller_forms_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_forms_auth_select ON public.seller_forms FOR SELECT TO authenticated USING (true);


--
-- Name: seller_forms seller_forms_auth_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_forms_auth_update ON public.seller_forms FOR UPDATE TO authenticated USING (true);


--
-- Name: seller_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_leads seller_leads_agency_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_leads_agency_manage ON public.seller_leads TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: seller_leads seller_leads_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_leads_public_insert ON public.seller_leads FOR INSERT TO anon WITH CHECK ((agency_id = '354facdb-cce2-4eb0-a160-8454854e731a'::uuid));


--
-- Name: seller_leads seller_leads_public_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_leads_public_insert_auth ON public.seller_leads FOR INSERT TO authenticated WITH CHECK ((agency_id = '354facdb-cce2-4eb0-a160-8454854e731a'::uuid));


--
-- Name: seller_listing_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_listing_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_listing_orders seller_listing_orders_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_listing_orders_agency_access ON public.seller_listing_orders TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: seller_readiness; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_readiness ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_readiness seller_readiness_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seller_readiness_agency_access ON public.seller_readiness TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: document_signatures signatures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signatures_insert ON public.document_signatures FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE (d.id = document_signatures.document_id))));


--
-- Name: document_signatures signatures_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signatures_read ON public.document_signatures FOR SELECT TO authenticated USING (true);


--
-- Name: social_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: social_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts social_posts_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_posts_auth_read ON public.social_posts FOR SELECT TO authenticated USING (true);


--
-- Name: social_posts social_posts_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_posts_auth_write ON public.social_posts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: social_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: social_settings social_settings_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_settings_auth_read ON public.social_settings FOR SELECT TO authenticated USING (true);


--
-- Name: social_settings social_settings_auth_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_settings_auth_write ON public.social_settings TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sold_comps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sold_comps ENABLE ROW LEVEL SECURITY;

--
-- Name: sold_comps sold_comps_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sold_comps_agency_access ON public.sold_comps TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: subscription_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_success_fees success fees readable by agency members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "success fees readable by agency members" ON public.deal_success_fees FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = deal_success_fees.agency_id) AND (m.profile_id = auth.uid())))));


--
-- Name: deal_success_fees success fees writable by agency admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "success fees writable by agency admins" ON public.deal_success_fees USING ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = deal_success_fees.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agency_members m
  WHERE ((m.agency_id = deal_success_fees.agency_id) AND (m.profile_id = auth.uid()) AND ((m.is_owner = true) OR (m.role = 'admin'::text))))));


--
-- Name: syndication_offers syndication_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY syndication_agency_access ON public.syndication_offers TO authenticated USING ((public.is_agency_member(from_agency_id) OR public.is_agency_member(to_agency_id))) WITH CHECK ((public.is_agency_member(from_agency_id) OR public.is_agency_member(to_agency_id)));


--
-- Name: syndication_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.syndication_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: team_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: training_certificates train_cert_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_cert_owner_read ON public.training_certificates FOR SELECT USING ((auth.uid() = broker_id));


--
-- Name: training_certificates train_cert_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_cert_write ON public.training_certificates FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: training_lessons train_lessons_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_lessons_read ON public.training_lessons FOR SELECT TO authenticated USING (true);


--
-- Name: training_lessons train_lessons_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_lessons_write ON public.training_lessons FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: training_modules train_modules_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_modules_read ON public.training_modules FOR SELECT TO authenticated USING (true);


--
-- Name: training_modules train_modules_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_modules_write ON public.training_modules FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: training_progress train_progress_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_progress_owner_all ON public.training_progress USING ((auth.uid() = broker_id)) WITH CHECK ((auth.uid() = broker_id));


--
-- Name: training_quiz_questions train_quiz_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_quiz_read ON public.training_quiz_questions FOR SELECT TO authenticated USING (true);


--
-- Name: training_quiz_questions train_quiz_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_quiz_write ON public.training_quiz_questions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: training_uploads train_uploads_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_uploads_auth_read ON public.training_uploads FOR SELECT TO authenticated USING (true);


--
-- Name: training_uploads train_uploads_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY train_uploads_owner_all ON public.training_uploads USING ((auth.uid() = broker_id)) WITH CHECK ((auth.uid() = broker_id));


--
-- Name: training_certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: training_certificates training_certificates_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY training_certificates_admin_read ON public.training_certificates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'broker'::text]))))));


--
-- Name: training_gamification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_gamification ENABLE ROW LEVEL SECURITY;

--
-- Name: training_gamification training_gamification_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY training_gamification_owner ON public.training_gamification TO authenticated USING ((broker_id = auth.uid())) WITH CHECK ((broker_id = auth.uid()));


--
-- Name: training_lesson_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_lesson_media ENABLE ROW LEVEL SECURITY;

--
-- Name: training_lesson_media training_lesson_media_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY training_lesson_media_read ON public.training_lesson_media FOR SELECT TO authenticated USING (true);


--
-- Name: training_lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: training_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: training_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: training_progress training_progress_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY training_progress_admin_read ON public.training_progress FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'broker'::text]))))));


--
-- Name: training_quiz_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_quiz_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: training_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: transition_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transition_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: transition_plans transition_plans_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transition_plans_agency_access ON public.transition_plans TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: trial_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_settings trial_settings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trial_settings_admin_all ON public.trial_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: trust_center_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trust_center_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: trust_center_settings trust_center_settings_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_center_settings_agency_access ON public.trust_center_settings TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: valuation_reports valuation reports readable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "valuation reports readable by owner" ON public.valuation_reports FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: valuation_reports valuation reports writable by service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "valuation reports writable by service" ON public.valuation_reports USING (true) WITH CHECK (true);


--
-- Name: valuation_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valuation_estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: valuation_estimates valuation_estimates_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY valuation_estimates_agency_access ON public.valuation_estimates TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: valuation_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valuation_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: value_growth_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.value_growth_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: value_growth_plans value_growth_plans_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY value_growth_plans_agency_access ON public.value_growth_plans TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: verified_financials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verified_financials ENABLE ROW LEVEL SECURITY;

--
-- Name: verified_financials verified_financials_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY verified_financials_agency_access ON public.verified_financials TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_watchlist_searches watchlist_searches_agency_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlist_searches_agency_access ON public.buyer_watchlist_searches TO authenticated USING (public.is_agency_member(agency_id)) WITH CHECK (public.is_agency_member(agency_id));


--
-- Name: buyer_watchlist_searches watchlist_searches_buyer_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlist_searches_buyer_access ON public.buyer_watchlist_searches TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.buyer_search_profiles p
  WHERE ((p.id = buyer_watchlist_searches.buyer_profile_id) AND (p.profile_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.buyer_search_profiles p
  WHERE ((p.id = buyer_watchlist_searches.buyer_profile_id) AND (p.profile_id = auth.uid())))));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_workflows workflows: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workflows: admin all" ON public.listing_workflows USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: listing_workflows workflows: agent owns via listing or assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workflows: agent owns via listing or assignment" ON public.listing_workflows USING (((agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_workflows.listing_id) AND (l.agent_id = auth.uid()))))));


--
-- PostgreSQL database dump complete
--


