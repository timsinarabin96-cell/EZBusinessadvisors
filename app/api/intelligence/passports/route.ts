import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'
import { createServerClient } from '@/lib/supabase/server'
import { extractSellerStatedFacts, scoreDealPassport } from '@/lib/passportScoring'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => null) as { listingId?: string } | null
  if (!body?.listingId || !/^[0-9a-f-]{36}$/i.test(body.listingId)) return NextResponse.json({ ok: false, error: 'A valid listingId is required' }, { status: 400 })

  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Database is not configured' }, { status: 503 })

  const { data: listing, error: listingError } = await supabase.from('listings').select('*').eq('id', body.listingId).maybeSingle()
  if (listingError) return NextResponse.json({ ok: false, error: listingError.message }, { status: 500 })
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!authenticated.memberships.some((membership) => membership.agency_id === listing.agency_id)) return forbiddenResponse()

  const { count: documentCount } = await supabase.from('financial_documents').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id).neq('status', 'archived')
  const scores = scoreDealPassport(listing, documentCount || 0)
  const analyzedAt = new Date().toISOString()

  const { data: passport, error: passportError } = await supabase.from('deal_passports').upsert({
    agency_id: listing.agency_id,
    listing_id: listing.id,
    verification_score: scores.verificationScore,
    liquidity_score: scores.liquidityScore,
    financing_score: scores.financingScore,
    documentation_score: scores.documentationScore,
    risk_flags: scores.riskFlags,
    readiness_actions: scores.readinessActions,
    status: listing.review_stage === 'approved' ? 'reviewed' : 'draft',
    last_analyzed_at: analyzedAt,
    updated_at: analyzedAt,
  }, { onConflict: 'listing_id' }).select('*').single()
  if (passportError) return NextResponse.json({ ok: false, error: passportError.message }, { status: 500 })

  const facts = extractSellerStatedFacts(listing).map((fact) => ({ ...fact, agency_id: listing.agency_id, passport_id: passport.id, listing_id: listing.id }))
  if (facts.length) {
    const { error: factsError } = await supabase.from('deal_fact_evidence').upsert(facts, { onConflict: 'listing_id,fact_key' })
    if (factsError) return NextResponse.json({ ok: false, error: factsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, passport, sellerStatedFacts: facts.length })
}
