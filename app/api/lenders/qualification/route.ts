import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// Lender qualification lookup — public, token-gated.
// GET /api/lenders/qualification?token=***
// Returns the deal + lender context the lender needs to qualify (never the
// raw financials — the lender opens the deal's data room / documents via the
// portal-style link which is token-scoped).
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token) return NextResponse.json({ ok: false, error: 'token is required' }, { status: 400 })

  const { data: q } = await db
    .from('lender_qualifications')
    .select(`
      id, deal_id, lender_id, agency_id, status, max_loan_amount, terms, notes,
      requested_at, viewed_at, responded_at, token,
      lenders:deal_professionals(name, firm, email, phone),
      deals(
        id, status, purchase_price, listing_id,
        listings(business_name, industry, location_general, asking_price, annual_revenue, sde)
      )
    `)
    .eq('token', token)
    .maybeSingle()
  if (!q) return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })

  // First open → mark as viewed so the broker sees "Lender viewing" in the CRM.
  if (!q.viewed_at) {
    try {
      await db.from('lender_qualifications').update({ viewed_at: new Date().toISOString() }).eq('id', q.id)
    } catch { /* best-effort */ }
  }

  const deal = q.deals as any
  const listing = deal?.listings || null
  const agencyId = q.agency_id

  // Count documents available in the deal's data room (for the lender UI).
  let docCount = 0
  let docs: { id: string; file_name: string; file_url: string; file_kind: string | null }[] = []
  try {
    const { data: rooms } = await db.from('data_rooms').select('id').eq('deal_id', q.deal_id).eq('status', 'active')
    const roomIds = (rooms || []).map((r: { id: string }) => r.id)
    if (roomIds.length > 0) {
      const { count } = await db
        .from('data_room_files')
        .select('id', { count: 'exact', head: true })
        .in('data_room_id', roomIds)
        .eq('is_deleted', false)
      docCount = count || 0
      // The lender needs the actual files to qualify — return them (token-scoped).
      const { data: files } = await db
        .from('data_room_files')
        .select('id, file_name, file_url, file_kind')
        .in('data_room_id', roomIds)
        .eq('is_deleted', false)
        .order('uploaded_at', { ascending: false })
        .limit(100)
      docs = (files || []) as { id: string; file_name: string; file_url: string; file_kind: string | null }[]
    }
  } catch { /* docs are best-effort */ }

  return NextResponse.json({
    ok: true,
    qualification: {
      id: q.id,
      dealId: q.deal_id,
      status: q.status,
      maxLoanAmount: q.max_loan_amount,
      terms: q.terms,
      notes: q.notes,
      requestedAt: q.requested_at,
      viewedAt: q.viewed_at,
      respondedAt: q.responded_at,
    },
    lender: q.lenders,
    deal: {
      id: deal?.id,
      status: deal?.status,
      purchasePrice: deal?.purchase_price,
      businessName: listing?.business_name || null,
      industry: listing?.industry || null,
      location: listing?.location_general || null,
      askingPrice: listing?.asking_price,
      annualRevenue: listing?.annual_revenue,
      sde: listing?.sde,
    },
    agencyId,
    docCount,
    docs,
  })
}
