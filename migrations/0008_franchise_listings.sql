-- =============================================================================
-- 0008_franchise_listings.sql
-- -----------------------------------------------------------------------------
-- Stage 1: Franchise Opportunities — a lighter, franchisor-input listing type.
-- Franchises have no operating revenue/SDE history, so they skip the
-- recast/BOV/CIM pipeline entirely. Franchise-specific fields live in
-- franchise_details (1:1 with listings); the recurring $299/mo Stripe
-- subscription lives in franchise_subscriptions (per brand listing).
-- Additive, idempotent, safe to re-run.
-- =============================================================================

-- Franchise-specific listing details (1:1 with listings)
CREATE TABLE IF NOT EXISTS public.franchise_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    listing_id uuid NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
    brand_name text NOT NULL,
    industry_category text,
    total_investment_min numeric,
    total_investment_max numeric,
    franchise_fee numeric,
    royalty_fee_pct numeric(5,2),
    territories_available text,
    existing_units integer,
    training_support text,
    ideal_candidate_liquid_capital numeric,
    ideal_candidate_net_worth numeric,
    item19_document_id uuid,          -- listing_documents.id for the optional Item 19 PDF (NDA-gated)
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Recurring $299/mo subscription per franchise brand listing
CREATE TABLE IF NOT EXISTS public.franchise_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    listing_id uuid NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
    status text DEFAULT 'trialing'::text NOT NULL,
    stripe_customer text,
    stripe_sub text,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS: franchise details are visible to the listing's agency + the public feed
-- mapping reads through the existing listings RLS; keep the tables agency-safe.
ALTER TABLE public.franchise_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_subscriptions ENABLE ROW LEVEL SECURITY;

-- Agency members can read/write franchise details for their own listings.
DROP POLICY IF EXISTS "franchise_details_agency" ON public.franchise_details;
CREATE POLICY "franchise_details_agency" ON public.franchise_details
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = franchise_details.listing_id
        AND public.is_agency_member(l.agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = franchise_details.listing_id
        AND public.is_agency_member(l.agency_id)
    )
  );

-- Subscriptions are agency-managed (mirrors the existing subscriptions table).
DROP POLICY IF EXISTS "franchise_subscriptions_agency" ON public.franchise_subscriptions;
CREATE POLICY "franchise_subscriptions_agency" ON public.franchise_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = franchise_subscriptions.listing_id
        AND public.is_agency_member(l.agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = franchise_subscriptions.listing_id
        AND public.is_agency_member(l.agency_id)
    )
  );
