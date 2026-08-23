import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createReferral, updateReferralStatus, listReferrals } from '@/lib/referrals'

export const runtime = 'nodejs'

/**
 * /api/referrals
 *
 * GET   — authenticated broker lists referrals ?agencyId=&status=
 * POST  — authenticated broker creates a referral
 *         { agencyId, referrerName, referrerEmail, referralType?, refereeName?, refereeEmail?, commissionPct?, notes? }
 * PATCH — authenticated broker advances a referral
 *         { id, status, convertedAt? }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId query param is required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const status = req.nextUrl.searchParams.get('status')
  const referrals = await listReferrals(agencyId, status)
  return NextResponse.json({ ok: true, agencyId, referrals })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = typeof body.agencyId === 'string' ? body.agencyId : ''
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId is required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await createReferral({
    agencyId,
    referrerName: typeof body.referrerName === 'string' ? body.referrerName : '',
    referrerEmail: typeof body.referrerEmail === 'string' ? body.referrerEmail : '',
    referralType: typeof body.referralType === 'string' ? body.referralType : 'buyer',
    refereeName: typeof body.refereeName === 'string' ? body.refereeName : null,
    refereeEmail: typeof body.refereeEmail === 'string' ? body.refereeEmail : null,
    commissionPct: typeof body.commissionPct === 'number' ? body.commissionPct : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if (!result.ok) {
    const status = result.error === 'not configured' ? 503 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, referral: result.data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  if (!id || !status) {
    return NextResponse.json({ ok: false, error: 'id and status are required' }, { status: 400 })
  }

  const { data: existing } = await db.from('referrals').select('id, agency_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'referral not found' }, { status: 404 })
  if (!canManageAgency(auth, existing.agency_id)) return forbiddenResponse()

  const result = await updateReferralStatus(id, status, {
    convertedAt: typeof body.convertedAt === 'string' ? body.convertedAt : null,
  })
  if (!result.ok) {
    const httpStatus = result.error === 'not configured' ? 503 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status: httpStatus })
  }
  return NextResponse.json({ ok: true, referral: result.data })
}
