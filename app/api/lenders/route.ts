import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// Lender workflow API
//   GET  /api/lenders?dealId=  — broker view: qualifications for a deal
//   POST /api/lenders/send     — agent sends a deal to a lender (creates the
//                                qualification + lender access link + email)
//   POST /api/lenders/respond  — lender qualifies/declines via secure token
//   GET  /api/lenders/qualification?token= — public lender link lookup
// =============================================================================

function makeToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'LND-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Broker view — qualifications for one deal (agency-scoped). */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })

  // Verify the deal belongs to the caller's agency.
  const { data: deal } = await db.from('deals').select('agency_id').eq('id', dealId).maybeSingle()
  const agencyId = (deal as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === agencyId)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this deal\'s agency' }, { status: 403 })
  }

  const { data } = await db
    .from('lender_qualifications')
    .select('*, lenders:deal_professionals(name, firm, email, phone, avatar_url)')
    .eq('deal_id', dealId)
    .order('requested_at', { ascending: false })
  return NextResponse.json({ ok: true, qualifications: data || [] })
}

/** Agent sends a deal to a lender. */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const dealId = String(body.dealId || '')
  const lenderId = String(body.lenderId || '')
  if (!dealId || !lenderId) {
    return NextResponse.json({ ok: false, error: 'dealId and lenderId are required' }, { status: 400 })
  }

  // Deal belongs to caller's agency?
  const { data: deal } = await db.from('deals').select('id, agency_id, listing_id, purchase_price, status').eq('id', dealId).maybeSingle()
  const dealAny = deal as { agency_id?: string | null; listing_id?: string | null; purchase_price?: number | null; status?: string | null } | null
  if (!dealAny?.agency_id) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === dealAny.agency_id)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this deal\'s agency' }, { status: 403 })
  }

  // Lender exists + is an active lender.
  const { data: lender } = await db
    .from('deal_professionals')
    .select('id, name, firm, email, phone')
    .eq('id', lenderId)
    .eq('professional_type', 'lender')
    .eq('is_active', true)
    .maybeSingle()
  if (!lender) return NextResponse.json({ ok: false, error: 'Lender not found or not active' }, { status: 404 })

  // Idempotent: if already sent to this lender, return the existing row.
  const { data: existing } = await db
    .from('lender_qualifications')
    .select('*')
    .eq('deal_id', dealId)
    .eq('lender_id', lenderId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: true, qualification: existing, lenderUrl: `/lender/${existing.token}` })
  }

  const token = makeToken()
  const { data: row, error } = await db
    .from('lender_qualifications')
    .insert({
      deal_id: dealId,
      lender_id: lenderId,
      agency_id: dealAny.agency_id,
      requested_by: auth.user.id,
      status: 'requested',
      token,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Notify the lender by email (best-effort).
  if (lender.email) {
    void (async () => {
      try {
        const { notify } = await import('@/lib/email')
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'
        await notify('generic', lender.email, {
          subject: 'You have a new deal to qualify',
          html: `
            <p>Hello ${lender.name || 'there'},</p>
            <p>A business brokerage sent you a deal to review for financing qualification.</p>
            <p>Open your secure qualification link to see the deal details and mark it prequalified or declined:</p>
            <p><a href="${origin}/lender/${token}" style="display:inline-block;padding:12px 20px;background:#1a1a2e;color:#e0c97e;border-radius:8px;text-decoration:none;font-weight:bold">Open deal for qualification →</a></p>
            <p style="color:#888;font-size:12px">This link is private to you — don't forward it.</p>
          `,
        }).catch(() => {})
      } catch { /* best-effort */ }
    })()
  }

  return NextResponse.json({ ok: true, qualification: row, lenderUrl: `/lender/${token}` }, { status: 201 })
}
