import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { exportListingsCsv, exportBuyerLeadsCsv, exportSellerLeadsCsv, parseCsv, importLeads } from '@/lib/csvTools'

export const runtime = 'nodejs'

/**
 * CSV Tools API
 * GET  /api/tools/csv?agencyId=...&type=listings|buyers|sellers — export CSV
 * POST /api/tools/csv { agencyId, type: 'buyer'|'seller', csv } — import leads
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type') || 'listings'
  let csv = ''
  if (type === 'listings') csv = await exportListingsCsv(agencyId)
  else if (type === 'buyers') csv = await exportBuyerLeadsCsv(agencyId)
  else if (type === 'sellers') csv = await exportSellerLeadsCsv(agencyId)
  else return NextResponse.json({ ok: false, error: 'type must be listings, buyers, or sellers' }, { status: 400 })

  if (!csv) return NextResponse.json({ ok: false, error: 'Export failed' }, { status: 500 })
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  if (!['buyer', 'seller'].includes(body.type)) {
    return NextResponse.json({ ok: false, error: 'type must be buyer or seller' }, { status: 400 })
  }
  if (!body.csv || typeof body.csv !== 'string') {
    return NextResponse.json({ ok: false, error: 'csv text is required' }, { status: 400 })
  }

  const rows = parseCsv(body.csv)
  if (!rows.length) return NextResponse.json({ ok: false, error: 'No rows found in CSV' }, { status: 400 })

  const result = await importLeads(agencyId, body.type, rows)
  return NextResponse.json({ ok: true, ...result })
}
