import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { evaluateListingCompliance, listJurisdictions } from '@/lib/compliance'
import { scoreListingQuality } from '@/lib/listingQuality'

export const runtime = 'nodejs'

/**
 * GET /api/compliance?listingId=... — compliance + quality evaluation for a
 * listing (broker tooling). Advisory only — verify with counsel.
 * GET /api/compliance?jurisdictions=1 — the full advisory matrix.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  if (req.nextUrl.searchParams.get('jurisdictions') === '1') {
    const jurisdictions = await listJurisdictions()
    return NextResponse.json({ ok: true, jurisdictions })
  }

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id, country_code, location_general, real_estate_included, business_name, asking_price, annual_revenue, sde, headline, industry, sub_industry, gallery_json, public_highlights, show_financials, is_confidential, is_absentee_owner, is_franchise, seller_financing_available, listing_ref')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const compliance = await evaluateListingCompliance({
    id: listing.id,
    agency_id: listing.agency_id,
    country_code: listing.country_code,
    location_general: listing.location_general,
    real_estate_included: listing.real_estate_included,
  })

  const quality = scoreListingQuality({
    id: listing.id,
    public_title: listing.business_name || '',
    public_summary: null,
    gallery_urls: Array.isArray(listing.gallery_json) ? listing.gallery_json : [],
    asking_price: listing.asking_price,
    annual_revenue: listing.annual_revenue,
    sde: listing.sde,
    industry: listing.industry,
    sub_industry: listing.sub_industry,
    public_highlights: Array.isArray(listing.public_highlights) ? listing.public_highlights : [],
    is_confidential: listing.is_confidential,
    show_financials: listing.show_financials,
    is_absentee_owner: listing.is_absentee_owner,
    is_franchise: listing.is_franchise,
    seller_financing_available: listing.seller_financing_available,
    location_general: listing.location_general,
    slug: null,
    is_featured: false,
    published_at: null,
    country_code: listing.country_code,
    currency_code: 'USD',
  })

  return NextResponse.json({ ok: true, compliance, quality, listing: { id: listing.id, listing_ref: listing.listing_ref, business_name: listing.business_name } })
}
