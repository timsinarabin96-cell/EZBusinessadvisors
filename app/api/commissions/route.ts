import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { recordCommission, updateCommissionStatus, listCommissions, exportCommissionsCsv } from '@/lib/commissions'

export const runtime = 'nodejs'

/**
 * /api/commissions
 *
 * GET   — authenticated broker lists commissions ?agencyId=&status=
 *         add &format=csv to download a CSV export (text/csv)
 * POST  — authenticated broker records a commission
 *         { agencyId, listingId?, dealId?, agentProfileId?, amount, commissionPct?, notes? }
 * PATCH — authenticated broker moves a commission
 *         { id, status }
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
  const format = req.nextUrl.searchParams.get('format')

  if (format === 'csv') {
    const csv = await exportCommissionsCsv(agencyId)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="commissions.csv"',
      },
    })
  }

  const commissions = await listCommissions(agencyId, status)
  return NextResponse.json({ ok: true, agencyId, commissions })
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

  const result = await recordCommission({
    agencyId,
    listingId: typeof body.listingId === 'string' ? body.listingId : null,
    dealId: typeof body.dealId === 'string' ? body.dealId : null,
    agentProfileId: typeof body.agentProfileId === 'string' ? body.agentProfileId : null,
    amount: typeof body.amount === 'number' ? body.amount : null,
    commissionPct: typeof body.commissionPct === 'number' ? body.commissionPct : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if (!result.ok) {
    const status = result.error === 'not configured' ? 503 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, commission: result.data }, { status: 201 })
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

  const { data: existing } = await db
    .from('commission_records')
    .select('id, agency_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'commission record not found' }, { status: 404 })
  if (!canManageAgency(auth, existing.agency_id)) return forbiddenResponse()

  const result = await updateCommissionStatus(id, status)
  if (!result.ok) {
    const httpStatus = result.error === 'not configured' ? 503 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status: httpStatus })
  }
  return NextResponse.json({ ok: true, commission: result.data })
}
