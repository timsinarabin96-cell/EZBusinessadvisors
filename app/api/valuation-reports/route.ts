import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { VALUATION_TIERS, createValuationReportOrder, finalizeValuationReport } from '@/lib/valuationReports'
import { createCheckoutSession, stripeConfigured } from '@/lib/stripeCheckout'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * /api/valuation-reports — sellable valuation reports (the data product).
 *
 * GET  ?agencyId=...            — list report orders for the agency
 * POST { listingId, tier }      — create an order + Stripe Checkout session.
 *      When Stripe isn't configured, generates the PDF immediately (demo mode)
 *      so the flow never hard-fails.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data, error } = await db
    .from('valuation_reports')
    .select('*, listings(id, business_name, asking_price, industry)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reports: data || [] })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  const listingId = String(body?.listingId || '').trim()
  const tier = String(body?.tier || '').trim()
  const email = String(body?.email || '').trim()

  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()
  if (!UUID_RE.test(listingId)) return NextResponse.json({ ok: false, error: 'Valid listingId is required' }, { status: 400 })
  const reportTier = VALUATION_TIERS.find((t) => t.id === tier)
  if (!reportTier) return NextResponse.json({ ok: false, error: 'Unknown report tier' }, { status: 400 })

  // Verify the listing belongs to this agency.
  const { data: listing } = await db.from('listings').select('id, agency_id, business_name').eq('id', listingId).maybeSingle()
  if (!listing || listing.agency_id !== agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
  const successUrl = body?.successUrl || `${origin}/dashboard/valuation-reports?checkout=success`
  const cancelUrl = body?.cancelUrl || `${origin}/dashboard/valuation-reports`

  const profileId = authenticated.profile?.id || null

  // --- Real Stripe path -------------------------------------------------------
  if (stripeConfigured()) {
    const result = await createCheckoutSession({
      agencyId,
      items: [{ name: `${reportTier.name} — ${listing.business_name || 'Business'}`, amountCents: reportTier.priceCents, description: reportTier.blurb }],
      successUrl,
      cancelUrl,
      customerEmail: email || null,
      metadata: { kind: 'valuation_report', tier: reportTier.id, listingId, agencyId },
    })
    if (!result.ok || !result.url) {
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }
    await createValuationReportOrder({ profileId, listingId, agencyId, tier: reportTier.id, stripeSession: null, status: 'pending' })
    return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
  }

  // --- Demo mode: create the order and generate the PDF immediately -----------
  const order = await createValuationReportOrder({ profileId, listingId, agencyId, tier: reportTier.id, stripeSession: null, status: 'pending' })
  if (!order.ok || !order.order) return NextResponse.json({ ok: false, error: order.error || 'Failed to create order' }, { status: 500 })

  const demoSession = `demo-${order.order.id}`
  await db.from('valuation_reports').update({ stripe_session: demoSession }).eq('id', order.order.id)
  const finalize = await finalizeValuationReport(demoSession)
  if (!finalize.ok) return NextResponse.json({ ok: false, error: finalize.error || 'Report generation failed' }, { status: 500 })

  return NextResponse.json({ ok: true, url: successUrl, mode: 'demo', orderId: order.order.id })
}
